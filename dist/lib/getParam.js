"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getParam = getParam;
const ApiError_1 = require("./ApiError");
/**
 * Safely extracts a route parameter as a string.
 * Express types req.params values as `string | string[]`, but in practice
 * they are always strings. This helper validates and narrows the type,
 * throwing a 400 error if the value is somehow an array or undefined.
 */
function getParam(value, name = "id") {
    if (Array.isArray(value)) {
        throw new ApiError_1.ApiError(400, `Invalid route parameter: ${name}`);
    }
    if (value === undefined || value === "") {
        throw new ApiError_1.ApiError(400, `Missing route parameter: ${name}`);
    }
    return value;
}
