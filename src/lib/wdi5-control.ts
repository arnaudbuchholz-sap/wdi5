import * as util from "util"

import { clientSide_getControl } from "../../client-side-js/getControl"
import { clientSide_interactWithControl } from "../../client-side-js/interactWithControl"
import { clientSide_executeControlMethod } from "../../client-side-js/executeControlMethod"
import { clientSide__getAggregation } from "../../client-side-js/_getAggregation"
import { clientSide_fireEvent } from "../../client-side-js/fireEvent"

import { Logger as _Logger } from "./Logger"
const Logger = _Logger.getInstance()

/**
 * This is a bridge object to use from selector to UI5 control
 * This can be seen as a generic representation of a UI5 control used to interact with the UI5 control
 * This does not adjust the funcitonality based on a UI5 control type
 */
export class WDI5Control {
    /**
     * control retrieved from browser-/native-context,
     * transferred to node-context
     * @typedef {Object} WDI5ControlSelector selected UI5 control
     * @property {String} wdio_ui5_key unique (wdi5-internal) key representing the UI5 control (selector)
     *
     */
    /** @type {WDI5ControlSelector} */
    _controlSelector = null
    /** @type {[WebdriverIO.Element | String]} */
    _webElement = null
    /** @type {[WebdriverIO.Element | String]} */
    _webdriverRepresentation = null
    /** @type {String} */
    _wdio_ui5_key = null
    /** @type {Array | String} */
    _generatedUI5Methods = null
    /** @type {Boolean} */
    _initialisation = false
    /** @type {Boolean} */
    _forceSelect = false

    /**
     * create a new bridge return object for a UI5 control
     */
    constructor() {
        return this
    }

    async init(controlSelector, forceSelect) {
        this._controlSelector = controlSelector
        this._wdio_ui5_key = controlSelector.wdio_ui5_key
        this._forceSelect = forceSelect

        // fire getControl just once when creating this webui5 object
        const controlResult = await this.getControl()

        if (typeof controlResult[0] === "string" && controlResult[0].toLowerCase().includes("error:")) {
            // result is string and has error text -> its an error
            Logger.error(`error retrieving control: ${this._wdio_ui5_key}`)
            return this
        } else {
            this._webElement = controlResult[0]

            // dynamic function bridge
            this._generatedUI5Methods = controlResult[1]
            await this.attachControlBridge(this._generatedUI5Methods)

            // set the sucesfull init param
            this._initialisation = true
        }

        return this
    }

    // --- public methods Getter ---

    /**
     * @return {Boolean} whether this control was sucessfull initialised
     */
    getInitStatus() {
        return this._initialisation
    }

    /**
     * @return {WebdriverIO.Element} the webdriver Element
     */
    getWebElement() {
        //// TODO: check this "fix"
        //// why is the renew necessary here?
        //// it causes hiccup with the fluent async api as the transition from node-scope
        //// to browser-scope errors out (in .getControl client-side)
        // if (this._forceSelect) {
        //     await this.renewWebElementReference()
        // }
        if (util.types.isProxy(this.getWebElement)) {
            return (this._webdriverRepresentation as Promise<any>).then(
                (webdriverRepresentation) => webdriverRepresentation
            )
        } else {
            return this._webdriverRepresentation
        }
    }

    /**
     * bridge to UI5 control getAggregation Method
     * @param {String} name
     * @return {any} content of the UI5 aggregation with name of parameter
     */
    async getAggregation(name) {
        if (this._forceSelect) {
            await this.renewWebElementReference()
        }
        return await this._getAggregation(name)
    }

    /**
     * enters a text into this UI5 control
     * @param {*} text
     * @return {WDI5Control} this for method chaining
     */
    async enterText(text) {
        // if (this._forceSelect) {
        //     this.renewWebElementReference();
        // }

        const oOptions = {
            enterText: text,
            selector: this._controlSelector.selector,
            clearTextFirst: true,
            interactionType: "ENTER_TEXT"
        }
        await this.interactWithControl(oOptions)
        return this
    }

    /**
     * click on a UI5 control
     * this works both on a standalone control as well as with the fluent async api
     */
    async press() {
        if (util.types.isProxy(this.getWebElement)) {
            return (this.getWebElement() as Promise<any>).then((webelement) => {
                return webelement.click()
            })
        } else {
            return await (this.getWebElement() as unknown as WebdriverIO.Element).click()
        }
    }

    /**
     * used to update the wdio control reference
     * this can be used to manually trigger an control reference update after a ui5 control rerendering
     * this method is also used wdi5 interally to implement the extended forceSelect option
     */
    async renewWebElementReference() {
        const newWebElement = (await this.getControl())[0]
        this._webElement = newWebElement
        return newWebElement
    }

    // --- private methods ---

    /**
     * retrieve UI5 control represenation of a UI5 control's aggregation
     *
     * @param {Array} aControls strings of IDs of aggregation items
     * @returns {WDI5Control[]} instances of wdi5 class per control in the aggregation
     */
    async _retrieveElements(aControls) {
        let aResultOfPromises = []

        // check the validity of param
        if (aControls) {
            // loop through items
            aControls.forEach((item) => {
                // item id -> create selector
                const selector = {
                    wdio_ui5_key: item.id, // plugin-internal, not part of RecordReplay.ControlSelector
                    forceSelect: this._forceSelect,
                    selector: {
                        id: item.id
                    }
                }

                // get WDI5 control
                aResultOfPromises.push(browser.asControl(selector))
            })

            return await Promise.all(aResultOfPromises)
        } else {
            Logger.warn(`${this._wdio_ui5_key} has no aControls`)
        }
    }

    /**
     * retrieve UI5 control represenation of a UI5 control's aggregation
     *
     * @param {webElement} eControl ID
     * @returns {WDI5Control[]} instances of wdi5 class per control in the aggregation
     */
    async _retrieveElement(eControl) {
        let eResult = {}

        // check the validity of param
        if (eControl) {
            // item id -> create selector
            const selector = {
                wdio_ui5_key: eControl.id, // plugin-internal, not part of RecordReplay.ControlSelector
                forceSelect: this._forceSelect,
                selector: {
                    id: eControl.id
                }
            }

            // get WDI5 control
            eResult = await browser.asControl(selector)
        } else {
            Logger.warn(`${this._wdio_ui5_key} has no aControls`)
        }

        return eResult
    }

    /**
     * attaches to the instance of this class the functions given in the parameter sReplFunctionNames
     *
     * @param {Array} sReplFunctionNames
     */
    private async attachControlBridge(sReplFunctionNames) {
        // check the validity of param
        if (sReplFunctionNames) {
            sReplFunctionNames.forEach(async (sMethodName) => {
                this[sMethodName] = await this.executeControlMethod.bind(this, sMethodName, this._webElement)
            })
        } else {
            Logger.warn(`${this._wdio_ui5_key} has no sReplFunctionNames`)
        }
    }

    /**
     * runtime - proxied browser-time UI5 controls' method at Node.js-runtime
     *
     * @param {String} methodName UI5 control method
     * @param {WebdriverIO.Element} webElement representation of selected UI5 control in wdio
     * @param  {...any} args proxied arguments to UI5 control method at runtime
     */
    private async executeControlMethod(methodName, webElement = this._webElement, ...args) {
        if (this._forceSelect) {
            this._webElement = await this.renewWebElementReference()
        }
        // special case for custom data attached to a UI5 control:
        // pass the arguments to the event handler (like UI5 handles and expects them) also
        // also here in Node.js runtime
        if (methodName === "fireEvent") {
            if (args[1] && typeof args[1]["eval"] === "function") {
                return await this.fireEvent(args[0], args[1], webElement)
            }
        }
        // returns the array of [0: "status", 1: result]

        // regular browser-time execution of UI5 control method
        const result = await clientSide_executeControlMethod(webElement, methodName, args)

        // create logging
        this.writeResultLog(result, methodName)

        switch (result[2]) {
            case "newElement":
                // retrieve and return another instance of a wdi5 control
                return await this._retrieveElement(result[1])
            case "element":
                // return $self after a called method of the wdi5 instance to allow method chaining
                return this
            case "result":
                // return result on array index 1 anyways
                return result[1]
            case "aggregation": // also applies for getAggregation convenience methods such as $ui5control.getItems()
                // check weather to retrieve all elements in the aggreation as ui5 controls
                if ((args.length > 0 && typeof args[0] === "boolean" && args[0] === false) || args.length === 0) {
                    // get all if param is false or undefined
                    return await this._retrieveElements(result[1])
                } else if (String(args[0]) && typeof args[0] === "number") {
                    // here we're retrieving the UI5 control at index args[0] from the aggregation
                    if (args[0] <= result[1].length) {
                        // retieve only one
                        // need some code of separate feature branch here
                        const wdioElement = result[1][args[0]]
                        return await this._retrieveElement(wdioElement)
                    } else {
                        console.error(
                            `tried to get an control at index: ${args[0]} of an aggregation outside of aggregation length: ${result[1].length}`
                        )
                    }
                } else {
                    // return wdio elements
                    return result[1]
                }
            case "none":
                return null
            default:
                return null
        }
    }

    /**
     * retrieve an aggregation's members as UI5 controls
     *
     * @param {String} aggregationName
     * @param {WebdriverIO.Element} webElement
     * @return {any}
     */
    private async _getAggregation(aggregationName, webElement = this._webElement) {
        const result = await clientSide__getAggregation(webElement, aggregationName)

        this.writeResultLog(result, "_getAggregation()")

        let wdiItems = []
        if (result[0] === "success") {
            wdiItems = await this._retrieveElements(result[1])
        }

        // else return empty array
        return wdiItems
    }

    // --- private actions ---

    /**
     * Interact with specific control.
     * @param {object} oOptions
     * @param {sap.ui.test.RecordReplay.ControlSelector} oOptions.selector - UI5 type
     * @param {sap.ui.test.RecordReplay.InteractionType} oOptions.interactionType - UI5 type
     * @param {string} oOptions.enterText
     * @param {boolean} oOptions.clearTextFirst
     */
    private async interactWithControl(oOptions) {
        const result = await clientSide_interactWithControl(oOptions)

        this.writeResultLog(result, "interactWithControl()")
        return result[1]
    }

    /**
     * fire a named event on a UI5 control
     * @param {String} eventName
     * @param {any} oOptions
     * @param {WebdriverIO.Element} webElement
     */
    async fireEvent(eventName, oOptions, webElement = this._webElement) {
        // Check the options have a eval property
        if (oOptions?.eval) {
            oOptions = "(" + oOptions.eval.toString() + ")"
        }
        const result = await clientSide_fireEvent(webElement, eventName, oOptions)
        this.writeResultLog(result, "_fireEvent()")
        return result[1]
    }

    // --- private internal ---

    /**
     * retrieve a DOM element via UI5 locator
     * @param {sap.ui.test.RecordReplay.ControlSelector} controlSelector
     * @return {[WebdriverIO.Element | String, [aProtoFunctions]]} UI5 control or error message, array of function names of this control
     */
    private async getControl(controlSelector = this._controlSelector) {
        // check whether we have a "by id regex" locator request
        if (controlSelector.selector.id && typeof controlSelector.selector.id === "object") {
            // make it a string for serializing into browser-scope and
            // further processing there
            controlSelector.selector.id = controlSelector.selector.id.toString()
        }

        // check whether we have a (partial) text matcher
        // that should match:
        // properties: {
        //     text: new RegExp(/.*ersi.*/gm)
        // }
        // ...but not:
        // properties: {
        //     text: {
        //         regex: {
        //             source: '.*ersi.*',
        //             flags: 'gm'
        //         }
        //     }
        // }
        if (
            typeof controlSelector.selector.properties?.text === "object" &&
            controlSelector.selector.properties?.text instanceof RegExp
        ) {
            // make it a string for serializing into browser-scope and
            // further processing there
            controlSelector.selector.properties.text = controlSelector.selector.properties.text.toString()
        }

        const result = await clientSide_getControl(controlSelector)

        // save the webdriver representation by control id
        if (result[2]) {
            // only if the result is valid
            this._webdriverRepresentation = await $(`#${result[2]}`)
        }

        this.writeResultLog(result, "getControl()")

        return [result[1], result[3]]
    }

    /**
     * create log based on the status of result[0]
     * @param {Array} result
     * @param {*} functionName
     */
    private writeResultLog(result, functionName) {
        if (result[0] === "error") {
            Logger.error(`call of ${functionName} failed because of: ${result[1]}`)
        } else if (result[0] === "success") {
            Logger.success(`call of function ${functionName} returned: ${JSON.stringify(result[1])}`)
        } else {
            Logger.warn(`Unknown status: ${functionName} returned: ${JSON.stringify(result[1])}`)
        }
    }
}
