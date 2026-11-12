import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import crypto, { randomBytes } from "node:crypto";
import os from "node:os";
// \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esmMin = (fn, res, err) => () => {
	if (err) throw err[0];
	try {
		return fn && (res = fn(fn = 0)), res;
	} catch (e) {
		throw err = [e], e;
	}
};
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod, mod.exports), cb = null), mod.exports);
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
var __toCommonJS = (mod) => __hasOwnProp.call(mod, "module.exports") ? mod["module.exports"] : __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __require = /* #__PURE__ */ (() => createRequire(import.meta.url))();
// src/prices.ts
var PER_MTOK = {
	"claude-haiku-5-5": {
		input: .1,
		output: .5,
		cacheRead: .01,
		longContext: {
			overTokens: 1e5,
			input: .5,
			output: 2.5,
			cacheRead: .05
		}
	},
	"claude-sonnet-5-5": {
		input: 2,
		output: 10,
		cacheRead: .1
	},
	"claude-opus-5-5": {
		input: 4,
		output: 20,
		cacheRead: .2
	},
	"opencode/deepseek-v4.1-flash-free": {
		input: 0,
		output: 0,
		cacheRead: 0
	}
};
var ALIASES = {
	haiku: "claude-haiku-5-5",
	sonnet: "claude-sonnet-5-5",
	opus: "claude-opus-5-5"
};
var CACHE_WRITE_5M = 1.25;
var CACHE_WRITE_1H = 2;
function canonicalModel(model) {
	if (!model) return null;
	const bare = String(model).replace(/^anthropic\//, "");
	return ALIASES[bare] ?? bare;
}
function priceUsage(model, tokens, cacheWriteTtlKnown) {
	const canonical = canonicalModel(model);
	const base = canonical === null ? void 0 : PER_MTOK[canonical];
	if (!base) return {
		costUsd: null,
		costSource: "unknown"
	};
	if (tokens.input == null || tokens.output == null) return {
		costUsd: null,
		costSource: "unknown"
	};
	const promptTokens = tokens.input + (tokens.cacheRead ?? 0) + (tokens.cacheWrite5m ?? 0) + (tokens.cacheWrite1h ?? 0);
	const price = base.longContext && promptTokens > base.longContext.overTokens ? base.longContext : base;
	const cost = tokens.input * price.input + tokens.output * price.output + (tokens.cacheRead ?? 0) * price.cacheRead + (tokens.cacheWrite5m ?? 0) * price.input * CACHE_WRITE_5M + (tokens.cacheWrite1h ?? 0) * price.input * CACHE_WRITE_1H;
	const hasUntimedWrites = !cacheWriteTtlKnown && (tokens.cacheWrite5m ?? 0) > 0;
	return {
		costUsd: cost / 1e6,
		costSource: hasUntimedWrites ? "estimated" : "measured"
	};
}
// node_modules/.pnpm/mustache@4.2.0/node_modules/mustache/mustache.mjs
/*!
* mustache.js - Logic-less {{mustache}} templates with JavaScript
* http://github.com/janl/mustache.js
*/
var objectToString = Object.prototype.toString;
var isArray = Array.isArray || function isArrayPolyfill(object) {
	return objectToString.call(object) === "[object Array]";
};
function isFunction(object) {
	return typeof object === "function";
}
/**
* More correct typeof string handling array
* which normally returns typeof 'object'
*/
function typeStr(obj) {
	return isArray(obj) ? "array" : typeof obj;
}
function escapeRegExp(string) {
	return string.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&");
}
/**
* Null safe way of checking whether or not an object,
* including its prototype, has a given property
*/
function hasProperty(obj, propName) {
	return obj != null && typeof obj === "object" && propName in obj;
}
/**
* Safe way of detecting whether or not the given thing is a primitive and
* whether it has the given property
*/
function primitiveHasOwnProperty(primitive, propName) {
	return primitive != null && typeof primitive !== "object" && primitive.hasOwnProperty && primitive.hasOwnProperty(propName);
}
var regExpTest = RegExp.prototype.test;
function testRegExp(re, string) {
	return regExpTest.call(re, string);
}
var nonSpaceRe = /\S/;
function isWhitespace(string) {
	return !testRegExp(nonSpaceRe, string);
}
var entityMap = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;",
	"/": "&#x2F;",
	"`": "&#x60;",
	"=": "&#x3D;"
};
function escapeHtml(string) {
	return String(string).replace(/[&<>"'`=\/]/g, function fromEntityMap(s) {
		return entityMap[s];
	});
}
var whiteRe = /\s*/;
var spaceRe = /\s+/;
var equalsRe = /\s*=/;
var curlyRe = /\s*\}/;
var tagRe = /#|\^|\/|>|\{|&|=|!/;
/**
* Breaks up the given `template` string into a tree of tokens. If the `tags`
* argument is given here it must be an array with two string values: the
* opening and closing tags used in the template (e.g. [ "<%", "%>" ]). Of
* course, the default is to use mustaches (i.e. mustache.tags).
*
* A token is an array with at least 4 elements. The first element is the
* mustache symbol that was used inside the tag, e.g. "#" or "&". If the tag
* did not contain a symbol (i.e. {{myValue}}) this element is "name". For
* all text that appears outside a symbol this element is "text".
*
* The second element of a token is its "value". For mustache tags this is
* whatever else was inside the tag besides the opening symbol. For text tokens
* this is the text itself.
*
* The third and fourth elements of the token are the start and end indices,
* respectively, of the token in the original template.
*
* Tokens that are the root node of a subtree contain two more elements: 1) an
* array of tokens in the subtree and 2) the index in the original template at
* which the closing tag for that section begins.
*
* Tokens for partials also contain two more elements: 1) a string value of
* indendation prior to that tag and 2) the index of that tag on that line -
* eg a value of 2 indicates the partial is the third tag on this line.
*/
function parseTemplate(template, tags) {
	if (!template) return [];
	var lineHasNonSpace = false;
	var sections = [];
	var tokens = [];
	var spaces = [];
	var hasTag = false;
	var nonSpace = false;
	var indentation = "";
	var tagIndex = 0;
	function stripSpace() {
		if (hasTag && !nonSpace) while (spaces.length) delete tokens[spaces.pop()];
		else spaces = [];
		hasTag = false;
		nonSpace = false;
	}
	var openingTagRe, closingTagRe, closingCurlyRe;
	function compileTags(tagsToCompile) {
		if (typeof tagsToCompile === "string") tagsToCompile = tagsToCompile.split(spaceRe, 2);
		if (!isArray(tagsToCompile) || tagsToCompile.length !== 2) throw new Error("Invalid tags: " + tagsToCompile);
		openingTagRe = new RegExp(escapeRegExp(tagsToCompile[0]) + "\\s*");
		closingTagRe = new RegExp("\\s*" + escapeRegExp(tagsToCompile[1]));
		closingCurlyRe = new RegExp("\\s*" + escapeRegExp("}" + tagsToCompile[1]));
	}
	compileTags(tags || mustache.tags);
	var scanner = new Scanner(template);
	var start, type, value, chr, token, openSection;
	while (!scanner.eos()) {
		start = scanner.pos;
		value = scanner.scanUntil(openingTagRe);
		if (value) for (var i = 0, valueLength = value.length; i < valueLength; ++i) {
			chr = value.charAt(i);
			if (isWhitespace(chr)) {
				spaces.push(tokens.length);
				indentation += chr;
			} else {
				nonSpace = true;
				lineHasNonSpace = true;
				indentation += " ";
			}
			tokens.push([
				"text",
				chr,
				start,
				start + 1
			]);
			start += 1;
			if (chr === "\n") {
				stripSpace();
				indentation = "";
				tagIndex = 0;
				lineHasNonSpace = false;
			}
		}
		if (!scanner.scan(openingTagRe)) break;
		hasTag = true;
		type = scanner.scan(tagRe) || "name";
		scanner.scan(whiteRe);
		if (type === "=") {
			value = scanner.scanUntil(equalsRe);
			scanner.scan(equalsRe);
			scanner.scanUntil(closingTagRe);
		} else if (type === "{") {
			value = scanner.scanUntil(closingCurlyRe);
			scanner.scan(curlyRe);
			scanner.scanUntil(closingTagRe);
			type = "&";
		} else value = scanner.scanUntil(closingTagRe);
		if (!scanner.scan(closingTagRe)) throw new Error("Unclosed tag at " + scanner.pos);
		if (type == ">") token = [
			type,
			value,
			start,
			scanner.pos,
			indentation,
			tagIndex,
			lineHasNonSpace
		];
		else token = [
			type,
			value,
			start,
			scanner.pos
		];
		tagIndex++;
		tokens.push(token);
		if (type === "#" || type === "^") sections.push(token);
		else if (type === "/") {
			openSection = sections.pop();
			if (!openSection) throw new Error("Unopened section \"" + value + "\" at " + start);
			if (openSection[1] !== value) throw new Error("Unclosed section \"" + openSection[1] + "\" at " + start);
		} else if (type === "name" || type === "{" || type === "&") nonSpace = true;
		else if (type === "=") compileTags(value);
	}
	stripSpace();
	openSection = sections.pop();
	if (openSection) throw new Error("Unclosed section \"" + openSection[1] + "\" at " + scanner.pos);
	return nestTokens(squashTokens(tokens));
}
/**
* Combines the values of consecutive text tokens in the given `tokens` array
* to a single token.
*/
function squashTokens(tokens) {
	var squashedTokens = [];
	var token, lastToken;
	for (var i = 0, numTokens = tokens.length; i < numTokens; ++i) {
		token = tokens[i];
		if (token) {
			if (token[0] === "text" && lastToken && lastToken[0] === "text") {
				lastToken[1] += token[1];
				lastToken[3] = token[3];
			} else {
				squashedTokens.push(token);
				lastToken = token;
			}
		}
	}
	return squashedTokens;
}
/**
* Forms the given array of `tokens` into a nested tree structure where
* tokens that represent a section have two additional items: 1) an array of
* all tokens that appear in that section and 2) the index in the original
* template that represents the end of that section.
*/
function nestTokens(tokens) {
	var nestedTokens = [];
	var collector = nestedTokens;
	var sections = [];
	var token, section;
	for (var i = 0, numTokens = tokens.length; i < numTokens; ++i) {
		token = tokens[i];
		switch (token[0]) {
			case "#":
			case "^":
				collector.push(token);
				sections.push(token);
				collector = token[4] = [];
				break;
			case "/":
				section = sections.pop();
				section[5] = token[2];
				collector = sections.length > 0 ? sections[sections.length - 1][4] : nestedTokens;
				break;
			default: collector.push(token);
		}
	}
	return nestedTokens;
}
/**
* A simple string scanner that is used by the template parser to find
* tokens in template strings.
*/
function Scanner(string) {
	this.string = string;
	this.tail = string;
	this.pos = 0;
}
/**
* Returns `true` if the tail is empty (end of string).
*/
Scanner.prototype.eos = function eos() {
	return this.tail === "";
};
/**
* Tries to match the given regular expression at the current position.
* Returns the matched text if it can match, the empty string otherwise.
*/
Scanner.prototype.scan = function scan(re) {
	var match = this.tail.match(re);
	if (!match || match.index !== 0) return "";
	var string = match[0];
	this.tail = this.tail.substring(string.length);
	this.pos += string.length;
	return string;
};
/**
* Skips all text until the given regular expression can be matched. Returns
* the skipped string, which is the entire tail if no match can be made.
*/
Scanner.prototype.scanUntil = function scanUntil(re) {
	var index = this.tail.search(re), match;
	switch (index) {
		case -1:
			match = this.tail;
			this.tail = "";
			break;
		case 0:
			match = "";
			break;
		default:
			match = this.tail.substring(0, index);
			this.tail = this.tail.substring(index);
	}
	this.pos += match.length;
	return match;
};
/**
* Represents a rendering context by wrapping a view object and
* maintaining a reference to the parent context.
*/
function Context(view, parentContext) {
	this.view = view;
	this.cache = { ".": this.view };
	this.parent = parentContext;
}
/**
* Creates a new context using the given view with this context
* as the parent.
*/
Context.prototype.push = function push(view) {
	return new Context(view, this);
};
/**
* Returns the value of the given name in this context, traversing
* up the context hierarchy if the value is absent in this context's view.
*/
Context.prototype.lookup = function lookup(name) {
	var cache = this.cache;
	var value;
	if (cache.hasOwnProperty(name)) value = cache[name];
	else {
		var context = this, intermediateValue, names, index, lookupHit = false;
		while (context) {
			if (name.indexOf(".") > 0) {
				intermediateValue = context.view;
				names = name.split(".");
				index = 0;
				/**
				* Using the dot notion path in `name`, we descend through the
				* nested objects.
				*
				* To be certain that the lookup has been successful, we have to
				* check if the last object in the path actually has the property
				* we are looking for. We store the result in `lookupHit`.
				*
				* This is specially necessary for when the value has been set to
				* `undefined` and we want to avoid looking up parent contexts.
				*
				* In the case where dot notation is used, we consider the lookup
				* to be successful even if the last "object" in the path is
				* not actually an object but a primitive (e.g., a string, or an
				* integer), because it is sometimes useful to access a property
				* of an autoboxed primitive, such as the length of a string.
				**/
				while (intermediateValue != null && index < names.length) {
					if (index === names.length - 1) lookupHit = hasProperty(intermediateValue, names[index]) || primitiveHasOwnProperty(intermediateValue, names[index]);
					intermediateValue = intermediateValue[names[index++]];
				}
			} else {
				intermediateValue = context.view[name];
				/**
				* Only checking against `hasProperty`, which always returns `false` if
				* `context.view` is not an object. Deliberately omitting the check
				* against `primitiveHasOwnProperty` if dot notation is not used.
				*
				* Consider this example:
				* ```
				* Mustache.render("The length of a football field is {{#length}}{{length}}{{/length}}.", {length: "100 yards"})
				* ```
				*
				* If we were to check also against `primitiveHasOwnProperty`, as we do
				* in the dot notation case, then render call would return:
				*
				* "The length of a football field is 9."
				*
				* rather than the expected:
				*
				* "The length of a football field is 100 yards."
				**/
				lookupHit = hasProperty(context.view, name);
			}
			if (lookupHit) {
				value = intermediateValue;
				break;
			}
			context = context.parent;
		}
		cache[name] = value;
	}
	if (isFunction(value)) value = value.call(this.view);
	return value;
};
/**
* A Writer knows how to take a stream of tokens and render them to a
* string, given a context. It also maintains a cache of templates to
* avoid the need to parse the same template twice.
*/
function Writer() {
	this.templateCache = {
		_cache: {},
		set: function set(key, value) {
			this._cache[key] = value;
		},
		get: function get(key) {
			return this._cache[key];
		},
		clear: function clear() {
			this._cache = {};
		}
	};
}
/**
* Clears all cached templates in this writer.
*/
Writer.prototype.clearCache = function clearCache() {
	if (typeof this.templateCache !== "undefined") this.templateCache.clear();
};
/**
* Parses and caches the given `template` according to the given `tags` or
* `mustache.tags` if `tags` is omitted,  and returns the array of tokens
* that is generated from the parse.
*/
Writer.prototype.parse = function parse(template, tags) {
	var cache = this.templateCache;
	var cacheKey = template + ":" + (tags || mustache.tags).join(":");
	var isCacheEnabled = typeof cache !== "undefined";
	var tokens = isCacheEnabled ? cache.get(cacheKey) : void 0;
	if (tokens == void 0) {
		tokens = parseTemplate(template, tags);
		isCacheEnabled && cache.set(cacheKey, tokens);
	}
	return tokens;
};
/**
* High-level method that is used to render the given `template` with
* the given `view`.
*
* The optional `partials` argument may be an object that contains the
* names and templates of partials that are used in the template. It may
* also be a function that is used to load partial templates on the fly
* that takes a single argument: the name of the partial.
*
* If the optional `config` argument is given here, then it should be an
* object with a `tags` attribute or an `escape` attribute or both.
* If an array is passed, then it will be interpreted the same way as
* a `tags` attribute on a `config` object.
*
* The `tags` attribute of a `config` object must be an array with two
* string values: the opening and closing tags used in the template (e.g.
* [ "<%", "%>" ]). The default is to mustache.tags.
*
* The `escape` attribute of a `config` object must be a function which
* accepts a string as input and outputs a safely escaped string.
* If an `escape` function is not provided, then an HTML-safe string
* escaping function is used as the default.
*/
Writer.prototype.render = function render(template, view, partials, config) {
	var tags = this.getConfigTags(config);
	var tokens = this.parse(template, tags);
	var context = view instanceof Context ? view : new Context(view, void 0);
	return this.renderTokens(tokens, context, partials, template, config);
};
/**
* Low-level method that renders the given array of `tokens` using
* the given `context` and `partials`.
*
* Note: The `originalTemplate` is only ever used to extract the portion
* of the original template that was contained in a higher-order section.
* If the template doesn't use higher-order sections, this argument may
* be omitted.
*/
Writer.prototype.renderTokens = function renderTokens(tokens, context, partials, originalTemplate, config) {
	var buffer = "";
	var token, symbol, value;
	for (var i = 0, numTokens = tokens.length; i < numTokens; ++i) {
		value = void 0;
		token = tokens[i];
		symbol = token[0];
		if (symbol === "#") value = this.renderSection(token, context, partials, originalTemplate, config);
		else if (symbol === "^") value = this.renderInverted(token, context, partials, originalTemplate, config);
		else if (symbol === ">") value = this.renderPartial(token, context, partials, config);
		else if (symbol === "&") value = this.unescapedValue(token, context);
		else if (symbol === "name") value = this.escapedValue(token, context, config);
		else if (symbol === "text") value = this.rawValue(token);
		if (value !== void 0) buffer += value;
	}
	return buffer;
};
Writer.prototype.renderSection = function renderSection(token, context, partials, originalTemplate, config) {
	var self = this;
	var buffer = "";
	var value = context.lookup(token[1]);
	function subRender(template) {
		return self.render(template, context, partials, config);
	}
	if (!value) return;
	if (isArray(value)) for (var j = 0, valueLength = value.length; j < valueLength; ++j) buffer += this.renderTokens(token[4], context.push(value[j]), partials, originalTemplate, config);
	else if (typeof value === "object" || typeof value === "string" || typeof value === "number") buffer += this.renderTokens(token[4], context.push(value), partials, originalTemplate, config);
	else if (isFunction(value)) {
		if (typeof originalTemplate !== "string") throw new Error("Cannot use higher-order sections without the original template");
		value = value.call(context.view, originalTemplate.slice(token[3], token[5]), subRender);
		if (value != null) buffer += value;
	} else buffer += this.renderTokens(token[4], context, partials, originalTemplate, config);
	return buffer;
};
Writer.prototype.renderInverted = function renderInverted(token, context, partials, originalTemplate, config) {
	var value = context.lookup(token[1]);
	if (!value || isArray(value) && value.length === 0) return this.renderTokens(token[4], context, partials, originalTemplate, config);
};
Writer.prototype.indentPartial = function indentPartial(partial, indentation, lineHasNonSpace) {
	var filteredIndentation = indentation.replace(/[^ \t]/g, "");
	var partialByNl = partial.split("\n");
	for (var i = 0; i < partialByNl.length; i++) if (partialByNl[i].length && (i > 0 || !lineHasNonSpace)) partialByNl[i] = filteredIndentation + partialByNl[i];
	return partialByNl.join("\n");
};
Writer.prototype.renderPartial = function renderPartial(token, context, partials, config) {
	if (!partials) return;
	var tags = this.getConfigTags(config);
	var value = isFunction(partials) ? partials(token[1]) : partials[token[1]];
	if (value != null) {
		var lineHasNonSpace = token[6];
		var tagIndex = token[5];
		var indentation = token[4];
		var indentedValue = value;
		if (tagIndex == 0 && indentation) indentedValue = this.indentPartial(value, indentation, lineHasNonSpace);
		var tokens = this.parse(indentedValue, tags);
		return this.renderTokens(tokens, context, partials, indentedValue, config);
	}
};
Writer.prototype.unescapedValue = function unescapedValue(token, context) {
	var value = context.lookup(token[1]);
	if (value != null) return value;
};
Writer.prototype.escapedValue = function escapedValue(token, context, config) {
	var escape = this.getConfigEscape(config) || mustache.escape;
	var value = context.lookup(token[1]);
	if (value != null) return typeof value === "number" && escape === mustache.escape ? String(value) : escape(value);
};
Writer.prototype.rawValue = function rawValue(token) {
	return token[1];
};
Writer.prototype.getConfigTags = function getConfigTags(config) {
	if (isArray(config)) return config;
	else if (config && typeof config === "object") return config.tags;
	else return;
};
Writer.prototype.getConfigEscape = function getConfigEscape(config) {
	if (config && typeof config === "object" && !isArray(config)) return config.escape;
	else return;
};
var mustache = {
	name: "mustache.js",
	version: "4.2.0",
	tags: ["{{", "}}"],
	clearCache: void 0,
	escape: void 0,
	parse: void 0,
	render: void 0,
	Scanner: void 0,
	Context: void 0,
	Writer: void 0,
	/**
	* Allows a user to override the default caching strategy, by providing an
	* object with set, get and clear methods. This can also be used to disable
	* the cache by setting it to the literal `undefined`.
	*/
	set templateCache(cache) {
		defaultWriter.templateCache = cache;
	},
	/**
	* Gets the default or overridden caching object from the default writer.
	*/
	get templateCache() {
		return defaultWriter.templateCache;
	}
};
var defaultWriter = new Writer();
/**
* Clears all cached templates in the default writer.
*/
mustache.clearCache = function clearCache() {
	return defaultWriter.clearCache();
};
/**
* Parses and caches the given template in the default writer and returns the
* array of tokens it contains. Doing this ahead of time avoids the need to
* parse templates on the fly as they are rendered.
*/
mustache.parse = function parse(template, tags) {
	return defaultWriter.parse(template, tags);
};
/**
* Renders the `template` with the given `view`, `partials`, and `config`
* using the default writer.
*/
mustache.render = function render(template, view, partials, config) {
	if (typeof template !== "string") throw new TypeError("Invalid template! Template should be a \"string\" but \"" + typeStr(template) + "\" was given as the first argument for mustache#render(template, view, partials)");
	return defaultWriter.render(template, view, partials, config);
};
mustache.escape = escapeHtml;
mustache.Scanner = Scanner;
mustache.Context = Context;
mustache.Writer = Writer;
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/identity.js
var require_identity = /* @__PURE__ */ __commonJSMin(((exports) => {
	var ALIAS = Symbol.for("yaml.alias");
	var DOC = Symbol.for("yaml.document");
	var MAP = Symbol.for("yaml.map");
	var PAIR = Symbol.for("yaml.pair");
	var SCALAR = Symbol.for("yaml.scalar");
	var SEQ = Symbol.for("yaml.seq");
	var NODE_TYPE = Symbol.for("yaml.node.type");
	var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
	var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
	var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
	var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
	var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
	var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
	function isCollection(node) {
		if (node && typeof node === "object") switch (node[NODE_TYPE]) {
			case MAP:
			case SEQ: return true;
		}
		return false;
	}
	function isNode(node) {
		if (node && typeof node === "object") switch (node[NODE_TYPE]) {
			case ALIAS:
			case MAP:
			case SCALAR:
			case SEQ: return true;
		}
		return false;
	}
	var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
	exports.ALIAS = ALIAS;
	exports.DOC = DOC;
	exports.MAP = MAP;
	exports.NODE_TYPE = NODE_TYPE;
	exports.PAIR = PAIR;
	exports.SCALAR = SCALAR;
	exports.SEQ = SEQ;
	exports.hasAnchor = hasAnchor;
	exports.isAlias = isAlias;
	exports.isCollection = isCollection;
	exports.isDocument = isDocument;
	exports.isMap = isMap;
	exports.isNode = isNode;
	exports.isPair = isPair;
	exports.isScalar = isScalar;
	exports.isSeq = isSeq;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/visit.js
var require_visit = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var BREAK = Symbol("break visit");
	var SKIP = Symbol("skip children");
	var REMOVE = Symbol("remove node");
	/**
	* Apply a visitor to an AST node or document.
	*
	* Walks through the tree (depth-first) starting from `node`, calling a
	* `visitor` function with three arguments:
	*   - `key`: For sequence values and map `Pair`, the node's index in the
	*     collection. Within a `Pair`, `'key'` or `'value'`, correspondingly.
	*     `null` for the root node.
	*   - `node`: The current node.
	*   - `path`: The ancestry of the current node.
	*
	* The return value of the visitor may be used to control the traversal:
	*   - `undefined` (default): Do nothing and continue
	*   - `visit.SKIP`: Do not visit the children of this node, continue with next
	*     sibling
	*   - `visit.BREAK`: Terminate traversal completely
	*   - `visit.REMOVE`: Remove the current node, then continue with the next one
	*   - `Node`: Replace the current node, then continue by visiting it
	*   - `number`: While iterating the items of a sequence or map, set the index
	*     of the next step. This is useful especially if the index of the current
	*     node has changed.
	*
	* If `visitor` is a single function, it will be called with all values
	* encountered in the tree, including e.g. `null` values. Alternatively,
	* separate visitor functions may be defined for each `Map`, `Pair`, `Seq`,
	* `Alias` and `Scalar` node. To define the same visitor function for more than
	* one node type, use the `Collection` (map and seq), `Value` (map, seq & scalar)
	* and `Node` (alias, map, seq & scalar) targets. Of all these, only the most
	* specific defined one will be used for each node.
	*/
	function visit(node, visitor) {
		const visitor_ = initVisitor(visitor);
		if (identity.isDocument(node)) {
			if (visit_(null, node.contents, visitor_, Object.freeze([node])) === REMOVE) node.contents = null;
		} else visit_(null, node, visitor_, Object.freeze([]));
	}
	/** Terminate visit traversal completely */
	visit.BREAK = BREAK;
	/** Do not visit the children of the current node */
	visit.SKIP = SKIP;
	/** Remove the current node */
	visit.REMOVE = REMOVE;
	function visit_(key, node, visitor, path) {
		const ctrl = callVisitor(key, node, visitor, path);
		if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
			replaceNode(key, path, ctrl);
			return visit_(key, ctrl, visitor, path);
		}
		if (typeof ctrl !== "symbol") {
			if (identity.isCollection(node)) {
				path = Object.freeze(path.concat(node));
				for (let i = 0; i < node.items.length; ++i) {
					const ci = visit_(i, node.items[i], visitor, path);
					if (typeof ci === "number") i = ci - 1;
					else if (ci === BREAK) return BREAK;
					else if (ci === REMOVE) {
						node.items.splice(i, 1);
						i -= 1;
					}
				}
			} else if (identity.isPair(node)) {
				path = Object.freeze(path.concat(node));
				const ck = visit_("key", node.key, visitor, path);
				if (ck === BREAK) return BREAK;
				else if (ck === REMOVE) node.key = null;
				const cv = visit_("value", node.value, visitor, path);
				if (cv === BREAK) return BREAK;
				else if (cv === REMOVE) node.value = null;
			}
		}
		return ctrl;
	}
	/**
	* Apply an async visitor to an AST node or document.
	*
	* Walks through the tree (depth-first) starting from `node`, calling a
	* `visitor` function with three arguments:
	*   - `key`: For sequence values and map `Pair`, the node's index in the
	*     collection. Within a `Pair`, `'key'` or `'value'`, correspondingly.
	*     `null` for the root node.
	*   - `node`: The current node.
	*   - `path`: The ancestry of the current node.
	*
	* The return value of the visitor may be used to control the traversal:
	*   - `Promise`: Must resolve to one of the following values
	*   - `undefined` (default): Do nothing and continue
	*   - `visit.SKIP`: Do not visit the children of this node, continue with next
	*     sibling
	*   - `visit.BREAK`: Terminate traversal completely
	*   - `visit.REMOVE`: Remove the current node, then continue with the next one
	*   - `Node`: Replace the current node, then continue by visiting it
	*   - `number`: While iterating the items of a sequence or map, set the index
	*     of the next step. This is useful especially if the index of the current
	*     node has changed.
	*
	* If `visitor` is a single function, it will be called with all values
	* encountered in the tree, including e.g. `null` values. Alternatively,
	* separate visitor functions may be defined for each `Map`, `Pair`, `Seq`,
	* `Alias` and `Scalar` node. To define the same visitor function for more than
	* one node type, use the `Collection` (map and seq), `Value` (map, seq & scalar)
	* and `Node` (alias, map, seq & scalar) targets. Of all these, only the most
	* specific defined one will be used for each node.
	*/
	async function visitAsync(node, visitor) {
		const visitor_ = initVisitor(visitor);
		if (identity.isDocument(node)) {
			if (await visitAsync_(null, node.contents, visitor_, Object.freeze([node])) === REMOVE) node.contents = null;
		} else await visitAsync_(null, node, visitor_, Object.freeze([]));
	}
	/** Terminate visit traversal completely */
	visitAsync.BREAK = BREAK;
	/** Do not visit the children of the current node */
	visitAsync.SKIP = SKIP;
	/** Remove the current node */
	visitAsync.REMOVE = REMOVE;
	async function visitAsync_(key, node, visitor, path) {
		const ctrl = await callVisitor(key, node, visitor, path);
		if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
			replaceNode(key, path, ctrl);
			return visitAsync_(key, ctrl, visitor, path);
		}
		if (typeof ctrl !== "symbol") {
			if (identity.isCollection(node)) {
				path = Object.freeze(path.concat(node));
				for (let i = 0; i < node.items.length; ++i) {
					const ci = await visitAsync_(i, node.items[i], visitor, path);
					if (typeof ci === "number") i = ci - 1;
					else if (ci === BREAK) return BREAK;
					else if (ci === REMOVE) {
						node.items.splice(i, 1);
						i -= 1;
					}
				}
			} else if (identity.isPair(node)) {
				path = Object.freeze(path.concat(node));
				const ck = await visitAsync_("key", node.key, visitor, path);
				if (ck === BREAK) return BREAK;
				else if (ck === REMOVE) node.key = null;
				const cv = await visitAsync_("value", node.value, visitor, path);
				if (cv === BREAK) return BREAK;
				else if (cv === REMOVE) node.value = null;
			}
		}
		return ctrl;
	}
	function initVisitor(visitor) {
		if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) return Object.assign({
			Alias: visitor.Node,
			Map: visitor.Node,
			Scalar: visitor.Node,
			Seq: visitor.Node
		}, visitor.Value && {
			Map: visitor.Value,
			Scalar: visitor.Value,
			Seq: visitor.Value
		}, visitor.Collection && {
			Map: visitor.Collection,
			Seq: visitor.Collection
		}, visitor);
		return visitor;
	}
	function callVisitor(key, node, visitor, path) {
		if (typeof visitor === "function") return visitor(key, node, path);
		if (identity.isMap(node)) return visitor.Map?.(key, node, path);
		if (identity.isSeq(node)) return visitor.Seq?.(key, node, path);
		if (identity.isPair(node)) return visitor.Pair?.(key, node, path);
		if (identity.isScalar(node)) return visitor.Scalar?.(key, node, path);
		if (identity.isAlias(node)) return visitor.Alias?.(key, node, path);
	}
	function replaceNode(key, path, node) {
		const parent = path[path.length - 1];
		if (identity.isCollection(parent)) parent.items[key] = node;
		else if (identity.isPair(parent)) {
			if (key === "key") parent.key = node;
			else parent.value = node;
		} else if (identity.isDocument(parent)) parent.contents = node;
		else {
			const pt = identity.isAlias(parent) ? "alias" : "scalar";
			throw new Error(`Cannot replace node with ${pt} parent`);
		}
	}
	exports.visit = visit;
	exports.visitAsync = visitAsync;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/directives.js
var require_directives = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var visit = require_visit();
	var escapeChars = {
		"!": "%21",
		",": "%2C",
		"[": "%5B",
		"]": "%5D",
		"{": "%7B",
		"}": "%7D"
	};
	var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
	var Directives = class Directives {
		constructor(yaml, tags) {
			/**
			* The directives-end/doc-start marker `---`. If `null`, a marker may still be
			* included in the document's stringified representation.
			*/
			this.docStart = null;
			/** The doc-end marker `...`.  */
			this.docEnd = false;
			this.yaml = Object.assign({}, Directives.defaultYaml, yaml);
			this.tags = Object.assign({}, Directives.defaultTags, tags);
		}
		clone() {
			const copy = new Directives(this.yaml, this.tags);
			copy.docStart = this.docStart;
			return copy;
		}
		/**
		* During parsing, get a Directives instance for the current document and
		* update the stream state according to the current version's spec.
		*/
		atDocument() {
			const res = new Directives(this.yaml, this.tags);
			switch (this.yaml.version) {
				case "1.1":
					this.atNextDocument = true;
					break;
				case "1.2":
					this.atNextDocument = false;
					this.yaml = {
						explicit: Directives.defaultYaml.explicit,
						version: "1.2"
					};
					this.tags = Object.assign({}, Directives.defaultTags);
			}
			return res;
		}
		/**
		* @param onError - May be called even if the action was successful
		* @returns `true` on success
		*/
		add(line, onError) {
			if (this.atNextDocument) {
				this.yaml = {
					explicit: Directives.defaultYaml.explicit,
					version: "1.1"
				};
				this.tags = Object.assign({}, Directives.defaultTags);
				this.atNextDocument = false;
			}
			const parts = line.trim().split(/[ \t]+/);
			const name = parts.shift();
			switch (name) {
				case "%TAG": {
					if (parts.length !== 2) {
						onError(0, "%TAG directive should contain exactly two parts");
						if (parts.length < 2) return false;
					}
					const [handle, prefix] = parts;
					this.tags[handle] = prefix;
					return true;
				}
				case "%YAML": {
					this.yaml.explicit = true;
					if (parts.length !== 1) {
						onError(0, "%YAML directive should contain exactly one part");
						return false;
					}
					const [version] = parts;
					if (version === "1.1" || version === "1.2") {
						this.yaml.version = version;
						return true;
					} else {
						const isValid = /^\d+\.\d+$/.test(version);
						onError(6, `Unsupported YAML version ${version}`, isValid);
						return false;
					}
				}
				default:
					onError(0, `Unknown directive ${name}`, true);
					return false;
			}
		}
		/**
		* Resolves a tag, matching handles to those defined in %TAG directives.
		*
		* @returns Resolved tag, which may also be the non-specific tag `'!'` or a
		*   `'!local'` tag, or `null` if unresolvable.
		*/
		tagName(source, onError) {
			if (source === "!") return "!";
			if (source[0] !== "!") {
				onError(`Not a valid tag: ${source}`);
				return null;
			}
			if (source[1] === "<") {
				const verbatim = source.slice(2, -1);
				if (verbatim === "!" || verbatim === "!!") {
					onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
					return null;
				}
				if (source[source.length - 1] !== ">") onError("Verbatim tags must end with a >");
				return verbatim;
			}
			const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
			if (!suffix) onError(`The ${source} tag has no suffix`);
			const prefix = this.tags[handle];
			if (prefix) try {
				return prefix + decodeURIComponent(suffix);
			} catch (error) {
				onError(String(error));
				return null;
			}
			if (handle === "!") return source;
			onError(`Could not resolve tag: ${source}`);
			return null;
		}
		/**
		* Given a fully resolved tag, returns its printable string form,
		* taking into account current tag prefixes and defaults.
		*/
		tagString(tag) {
			for (const [handle, prefix] of Object.entries(this.tags)) if (tag.startsWith(prefix)) return handle + escapeTagName(tag.substring(prefix.length));
			return tag[0] === "!" ? tag : `!<${tag}>`;
		}
		toString(doc) {
			const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
			const tagEntries = Object.entries(this.tags);
			let tagNames;
			if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
				const tags = {};
				visit.visit(doc.contents, (_key, node) => {
					if (identity.isNode(node) && node.tag) tags[node.tag] = true;
				});
				tagNames = Object.keys(tags);
			} else tagNames = [];
			for (const [handle, prefix] of tagEntries) {
				if (handle === "!!" && prefix === "tag:yaml.org,2002:") continue;
				if (!doc || tagNames.some((tn) => tn.startsWith(prefix))) lines.push(`%TAG ${handle} ${prefix}`);
			}
			return lines.join("\n");
		}
	};
	Directives.defaultYaml = {
		explicit: false,
		version: "1.2"
	};
	Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
	exports.Directives = Directives;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/anchors.js
var require_anchors = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var visit = require_visit();
	/**
	* Verify that the input string is a valid anchor.
	*
	* Will throw on errors.
	*/
	function anchorIsValid(anchor) {
		if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
			const msg = `Anchor must not contain whitespace or control characters: ${JSON.stringify(anchor)}`;
			throw new Error(msg);
		}
		return true;
	}
	function anchorNames(root) {
		const anchors = /* @__PURE__ */ new Set();
		visit.visit(root, { Value(_key, node) {
			if (node.anchor) anchors.add(node.anchor);
		} });
		return anchors;
	}
	/** Find a new anchor name with the given `prefix` and a one-indexed suffix. */
	function findNewAnchor(prefix, exclude) {
		for (let i = 1;; ++i) {
			const name = `${prefix}${i}`;
			if (!exclude.has(name)) return name;
		}
	}
	function createNodeAnchors(doc, prefix) {
		const aliasObjects = [];
		const sourceObjects = /* @__PURE__ */ new Map();
		let prevAnchors = null;
		return {
			onAnchor: (source) => {
				aliasObjects.push(source);
				prevAnchors ?? (prevAnchors = anchorNames(doc));
				const anchor = findNewAnchor(prefix, prevAnchors);
				prevAnchors.add(anchor);
				return anchor;
			},
			/**
			* With circular references, the source node is only resolved after all
			* of its child nodes are. This is why anchors are set only after all of
			* the nodes have been created.
			*/
			setAnchors: () => {
				for (const source of aliasObjects) {
					const ref = sourceObjects.get(source);
					if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) ref.node.anchor = ref.anchor;
					else {
						const error = /* @__PURE__ */ new Error("Failed to resolve repeated object (this should not happen)");
						error.source = source;
						throw error;
					}
				}
			},
			sourceObjects
		};
	}
	exports.anchorIsValid = anchorIsValid;
	exports.anchorNames = anchorNames;
	exports.createNodeAnchors = createNodeAnchors;
	exports.findNewAnchor = findNewAnchor;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = /* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* Applies the JSON.parse reviver algorithm as defined in the ECMA-262 spec,
	* in section 24.5.1.1 "Runtime Semantics: InternalizeJSONProperty" of the
	* 2021 edition: https://tc39.es/ecma262/#sec-json.parse
	*
	* Includes extensions for handling Map and Set objects.
	*/
	function applyReviver(reviver, obj, key, val) {
		if (val && typeof val === "object") {
			if (Array.isArray(val)) for (let i = 0, len = val.length; i < len; ++i) {
				const v0 = val[i];
				const v1 = applyReviver(reviver, val, String(i), v0);
				if (v1 === void 0) delete val[i];
				else if (v1 !== v0) val[i] = v1;
			}
			else if (val instanceof Map) for (const k of Array.from(val.keys())) {
				const v0 = val.get(k);
				const v1 = applyReviver(reviver, val, k, v0);
				if (v1 === void 0) val.delete(k);
				else if (v1 !== v0) val.set(k, v1);
			}
			else if (val instanceof Set) for (const v0 of Array.from(val)) {
				const v1 = applyReviver(reviver, val, v0, v0);
				if (v1 === void 0) val.delete(v0);
				else if (v1 !== v0) {
					val.delete(v0);
					val.add(v1);
				}
			}
			else for (const [k, v0] of Object.entries(val)) {
				const v1 = applyReviver(reviver, val, k, v0);
				if (v1 === void 0) delete val[k];
				else if (v1 !== v0) val[k] = v1;
			}
		}
		return reviver.call(obj, key, val);
	}
	exports.applyReviver = applyReviver;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/toJS.js
var require_toJS = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	/**
	* Recursively convert any node or its contents to native JavaScript
	*
	* @param value - The input value
	* @param arg - If `value` defines a `toJSON()` method, use this
	*   as its first argument
	* @param ctx - Conversion context, originally set in Document#toJS(). If
	*   `{ keep: true }` is not set, output should be suitable for JSON
	*   stringification.
	*/
	function toJS(value, arg, ctx) {
		if (Array.isArray(value)) return value.map((v, i) => toJS(v, String(i), ctx));
		if (value && typeof value.toJSON === "function") {
			if (!ctx || !identity.hasAnchor(value)) return value.toJSON(arg, ctx);
			const data = {
				aliasCount: 0,
				count: 1,
				res: void 0
			};
			ctx.anchors.set(value, data);
			ctx.onCreate = (res) => {
				data.res = res;
				delete ctx.onCreate;
			};
			const res = value.toJSON(arg, ctx);
			if (ctx.onCreate) ctx.onCreate(res);
			return res;
		}
		if (typeof value === "bigint" && !ctx?.keep) return Number(value);
		return value;
	}
	exports.toJS = toJS;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Node.js
var require_Node = /* @__PURE__ */ __commonJSMin(((exports) => {
	var applyReviver = require_applyReviver();
	var identity = require_identity();
	var toJS = require_toJS();
	var NodeBase = class {
		constructor(type) {
			Object.defineProperty(this, identity.NODE_TYPE, { value: type });
		}
		/** Create a copy of this node.  */
		clone() {
			const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
			if (this.range) copy.range = this.range.slice();
			return copy;
		}
		/** A plain JavaScript representation of this node. */
		toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
			if (!identity.isDocument(doc)) throw new TypeError("A document argument is required");
			const ctx = {
				anchors: /* @__PURE__ */ new Map(),
				doc,
				keep: true,
				mapAsMap: mapAsMap === true,
				mapKeyWarned: false,
				maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
			};
			const res = toJS.toJS(this, "", ctx);
			if (typeof onAnchor === "function") for (const { count, res } of ctx.anchors.values()) onAnchor(res, count);
			return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
		}
	};
	exports.NodeBase = NodeBase;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Alias.js
var require_Alias = /* @__PURE__ */ __commonJSMin(((exports) => {
	var anchors = require_anchors();
	var visit = require_visit();
	var identity = require_identity();
	var Node = require_Node();
	var toJS = require_toJS();
	var Alias = class extends Node.NodeBase {
		constructor(source) {
			super(identity.ALIAS);
			this.source = source;
			Object.defineProperty(this, "tag", { set() {
				throw new Error("Alias nodes cannot have tags");
			} });
		}
		/**
		* Resolve the value of this alias within `doc`, finding the last
		* instance of the `source` anchor before this node.
		*/
		resolve(doc, ctx) {
			if (ctx?.maxAliasCount === 0) throw new ReferenceError("Alias resolution is disabled");
			let nodes;
			if (ctx?.aliasResolveCache) nodes = ctx.aliasResolveCache;
			else {
				nodes = [];
				visit.visit(doc, { Node: (_key, node) => {
					if (identity.isAlias(node) || identity.hasAnchor(node)) nodes.push(node);
				} });
				if (ctx) ctx.aliasResolveCache = nodes;
			}
			let found = void 0;
			for (const node of nodes) {
				if (node === this) break;
				if (node.anchor === this.source) found = node;
			}
			if (found && ctx) {
				const { anchors, doc, maxAliasCount } = ctx;
				let data = anchors.get(found);
				if (!data) {
					toJS.toJS(found, null, ctx);
					data = anchors.get(found);
				}
				/* istanbul ignore if */
				if (data?.res === void 0) throw new ReferenceError("This should not happen: Alias anchor was not resolved?");
				if (maxAliasCount >= 0) {
					data.count += 1;
					if (data.aliasCount === 0) data.aliasCount = getAliasCount(doc, found, anchors);
					if (data.count * data.aliasCount > maxAliasCount) throw new ReferenceError("Excessive alias count indicates a resource exhaustion attack");
				}
			}
			return found;
		}
		toJSON(_arg, ctx) {
			if (!ctx) return { source: this.source };
			const source = this.resolve(ctx.doc, ctx);
			if (!source) {
				const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
				throw new ReferenceError(msg);
			}
			return ctx.anchors.get(source).res;
		}
		toString(ctx, _onComment, _onChompKeep) {
			const src = `*${this.source}`;
			if (ctx) {
				anchors.anchorIsValid(this.source);
				if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
					const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
					throw new Error(msg);
				}
				if (ctx.implicitKey) return `${src} `;
			}
			return src;
		}
	};
	function getAliasCount(doc, node, anchors) {
		if (identity.isAlias(node)) {
			const source = node.resolve(doc);
			const anchor = anchors && source && anchors.get(source);
			return anchor ? anchor.count * anchor.aliasCount : 0;
		} else if (identity.isCollection(node)) {
			let count = 0;
			for (const item of node.items) {
				const c = getAliasCount(doc, item, anchors);
				if (c > count) count = c;
			}
			return count;
		} else if (identity.isPair(node)) {
			const kc = getAliasCount(doc, node.key, anchors);
			const vc = getAliasCount(doc, node.value, anchors);
			return Math.max(kc, vc);
		}
		return 1;
	}
	exports.Alias = Alias;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var Node = require_Node();
	var toJS = require_toJS();
	var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
	var Scalar = class extends Node.NodeBase {
		constructor(value) {
			super(identity.SCALAR);
			this.value = value;
		}
		toJSON(arg, ctx) {
			return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
		}
		toString() {
			return String(this.value);
		}
	};
	Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
	Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
	Scalar.PLAIN = "PLAIN";
	Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
	Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
	exports.Scalar = Scalar;
	exports.isScalarValue = isScalarValue;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/createNode.js
var require_createNode = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Alias = require_Alias();
	var identity = require_identity();
	var Scalar = require_Scalar();
	var defaultTagPrefix = "tag:yaml.org,2002:";
	function findTagObject(value, tagName, tags) {
		if (tagName) {
			const match = tags.filter((t) => t.tag === tagName);
			const tagObj = match.find((t) => !t.format) ?? match[0];
			if (!tagObj) throw new Error(`Tag ${tagName} not found`);
			return tagObj;
		}
		return tags.find((t) => t.identify?.(value) && !t.format);
	}
	function createNode(value, tagName, ctx) {
		if (identity.isDocument(value)) value = value.contents;
		if (identity.isNode(value)) return value;
		if (identity.isPair(value)) {
			const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
			map.items.push(value);
			return map;
		}
		if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) value = value.valueOf();
		const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
		let ref = void 0;
		if (aliasDuplicateObjects && value && typeof value === "object") {
			ref = sourceObjects.get(value);
			if (ref) {
				ref.anchor ?? (ref.anchor = onAnchor(value));
				return new Alias.Alias(ref.anchor);
			} else {
				ref = {
					anchor: null,
					node: null
				};
				sourceObjects.set(value, ref);
			}
		}
		if (tagName?.startsWith("!!")) tagName = defaultTagPrefix + tagName.slice(2);
		let tagObj = findTagObject(value, tagName, schema.tags);
		if (!tagObj) {
			if (value && typeof value.toJSON === "function") value = value.toJSON();
			if (!value || typeof value !== "object") {
				const node = new Scalar.Scalar(value);
				if (ref) ref.node = node;
				return node;
			}
			tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
		}
		if (onTagObj) {
			onTagObj(tagObj);
			delete ctx.onTagObj;
		}
		const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
		if (tagName) node.tag = tagName;
		else if (!tagObj.default) node.tag = tagObj.tag;
		if (ref) ref.node = node;
		return node;
	}
	exports.createNode = createNode;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Collection.js
var require_Collection = /* @__PURE__ */ __commonJSMin(((exports) => {
	var createNode = require_createNode();
	var identity = require_identity();
	var Node = require_Node();
	function collectionFromPath(schema, path, value) {
		let v = value;
		for (let i = path.length - 1; i >= 0; --i) {
			const k = path[i];
			if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
				const a = [];
				a[k] = v;
				v = a;
			} else v = /* @__PURE__ */ new Map([[k, v]]);
		}
		return createNode.createNode(v, void 0, {
			aliasDuplicateObjects: false,
			keepUndefined: false,
			onAnchor: () => {
				throw new Error("This should not happen, please report a bug.");
			},
			schema,
			sourceObjects: /* @__PURE__ */ new Map()
		});
	}
	var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
	var Collection = class extends Node.NodeBase {
		constructor(type, schema) {
			super(type);
			Object.defineProperty(this, "schema", {
				value: schema,
				configurable: true,
				enumerable: false,
				writable: true
			});
		}
		/**
		* Create a copy of this collection.
		*
		* @param schema - If defined, overwrites the original's schema
		*/
		clone(schema) {
			const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
			if (schema) copy.schema = schema;
			copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
			if (this.range) copy.range = this.range.slice();
			return copy;
		}
		/**
		* Adds a value to the collection. For `!!map` and `!!omap` the value must
		* be a Pair instance or a `{ key, value }` object, which may not have a key
		* that already exists in the map.
		*/
		addIn(path, value) {
			if (isEmptyPath(path)) this.add(value);
			else {
				const [key, ...rest] = path;
				const node = this.get(key, true);
				if (identity.isCollection(node)) node.addIn(rest, value);
				else if (node === void 0 && this.schema) this.set(key, collectionFromPath(this.schema, rest, value));
				else throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
			}
		}
		/**
		* Removes a value from the collection.
		* @returns `true` if the item was found and removed.
		*/
		deleteIn(path) {
			const [key, ...rest] = path;
			if (rest.length === 0) return this.delete(key);
			const node = this.get(key, true);
			if (identity.isCollection(node)) return node.deleteIn(rest);
			else throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
		}
		/**
		* Returns item at `key`, or `undefined` if not found. By default unwraps
		* scalar values from their surrounding node; to disable set `keepScalar` to
		* `true` (collections are always returned intact).
		*/
		getIn(path, keepScalar) {
			const [key, ...rest] = path;
			const node = this.get(key, true);
			if (rest.length === 0) return !keepScalar && identity.isScalar(node) ? node.value : node;
			else return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
		}
		hasAllNullValues(allowScalar) {
			return this.items.every((node) => {
				if (!identity.isPair(node)) return false;
				const n = node.value;
				return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
			});
		}
		/**
		* Checks if the collection includes a value with the key `key`.
		*/
		hasIn(path) {
			const [key, ...rest] = path;
			if (rest.length === 0) return this.has(key);
			const node = this.get(key, true);
			return identity.isCollection(node) ? node.hasIn(rest) : false;
		}
		/**
		* Sets a value in this collection. For `!!set`, `value` needs to be a
		* boolean to add/remove the item from the set.
		*/
		setIn(path, value) {
			const [key, ...rest] = path;
			if (rest.length === 0) this.set(key, value);
			else {
				const node = this.get(key, true);
				if (identity.isCollection(node)) node.setIn(rest, value);
				else if (node === void 0 && this.schema) this.set(key, collectionFromPath(this.schema, rest, value));
				else throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
			}
		}
	};
	exports.Collection = Collection;
	exports.collectionFromPath = collectionFromPath;
	exports.isEmptyPath = isEmptyPath;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = /* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* Stringifies a comment.
	*
	* Empty comment lines are left empty,
	* lines consisting of a single space are replaced by `#`,
	* and all other lines are prefixed with a `#`.
	*/
	var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
	function indentComment(comment, indent) {
		if (/^\n+$/.test(comment)) return comment.substring(1);
		return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
	}
	var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
	exports.indentComment = indentComment;
	exports.lineComment = lineComment;
	exports.stringifyComment = stringifyComment;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = /* @__PURE__ */ __commonJSMin(((exports) => {
	var FOLD_FLOW = "flow";
	var FOLD_BLOCK = "block";
	var FOLD_QUOTED = "quoted";
	/**
	* Tries to keep input at up to `lineWidth` characters, splitting only on spaces
	* not followed by newlines or spaces unless `mode` is `'quoted'`. Lines are
	* terminated with `\n` and started with `indent`.
	*/
	function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
		if (!lineWidth || lineWidth < 0) return text;
		if (lineWidth < minContentWidth) minContentWidth = 0;
		const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
		if (text.length <= endStep) return text;
		const folds = [];
		const escapedFolds = {};
		let end = lineWidth - indent.length;
		if (typeof indentAtStart === "number") {
			if (indentAtStart > lineWidth - Math.max(2, minContentWidth)) folds.push(0);
			else end = lineWidth - indentAtStart;
		}
		let split = void 0;
		let prev = void 0;
		let overflow = false;
		let i = -1;
		let escStart = -1;
		let escEnd = -1;
		if (mode === FOLD_BLOCK) {
			i = consumeMoreIndentedLines(text, i, indent.length);
			if (i !== -1) end = i + endStep;
		}
		for (let ch; ch = text[i += 1];) {
			if (mode === FOLD_QUOTED && ch === "\\") {
				escStart = i;
				switch (text[i + 1]) {
					case "x":
						i += 3;
						break;
					case "u":
						i += 5;
						break;
					case "U":
						i += 9;
						break;
					default: i += 1;
				}
				escEnd = i;
			}
			if (ch === "\n") {
				if (mode === FOLD_BLOCK) i = consumeMoreIndentedLines(text, i, indent.length);
				end = i + indent.length + endStep;
				split = void 0;
			} else {
				if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
					const next = text[i + 1];
					if (next && next !== " " && next !== "\n" && next !== "	") split = i;
				}
				if (i >= end) {
					if (split) {
						folds.push(split);
						end = split + endStep;
						split = void 0;
					} else if (mode === FOLD_QUOTED) {
						while (prev === " " || prev === "	") {
							prev = ch;
							ch = text[i += 1];
							overflow = true;
						}
						const j = i > escEnd + 1 ? i - 2 : escStart - 1;
						if (escapedFolds[j]) return text;
						folds.push(j);
						escapedFolds[j] = true;
						end = j + endStep;
						split = void 0;
					} else overflow = true;
				}
			}
			prev = ch;
		}
		if (overflow && onOverflow) onOverflow();
		if (folds.length === 0) return text;
		if (onFold) onFold();
		let res = text.slice(0, folds[0]);
		for (let i = 0; i < folds.length; ++i) {
			const fold = folds[i];
			const end = folds[i + 1] || text.length;
			if (fold === 0) res = `\n${indent}${text.slice(0, end)}`;
			else {
				if (mode === FOLD_QUOTED && escapedFolds[fold]) res += `${text[fold]}\\`;
				res += `\n${indent}${text.slice(fold + 1, end)}`;
			}
		}
		return res;
	}
	/**
	* Presumes `i + 1` is at the start of a line
	* @returns index of last newline in more-indented block
	*/
	function consumeMoreIndentedLines(text, i, indent) {
		let end = i;
		let start = i + 1;
		let ch = text[start];
		while (ch === " " || ch === "	") if (i < start + indent) ch = text[++i];
		else {
			do
				ch = text[++i];
			while (ch && ch !== "\n");
			end = i;
			start = i + 1;
			ch = text[start];
		}
		return end;
	}
	exports.FOLD_BLOCK = FOLD_BLOCK;
	exports.FOLD_FLOW = FOLD_FLOW;
	exports.FOLD_QUOTED = FOLD_QUOTED;
	exports.foldFlowLines = foldFlowLines;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Scalar = require_Scalar();
	var foldFlowLines = require_foldFlowLines();
	var getFoldOptions = (ctx, isBlock) => ({
		indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
		lineWidth: ctx.options.lineWidth,
		minContentWidth: ctx.options.minContentWidth
	});
	var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
	function lineLengthOverLimit(str, lineWidth, indentLength) {
		if (!lineWidth || lineWidth < 0) return false;
		const limit = lineWidth - indentLength;
		const strLen = str.length;
		if (strLen <= limit) return false;
		for (let i = 0, start = 0; i < strLen; ++i) if (str[i] === "\n") {
			if (i - start > limit) return true;
			start = i + 1;
			if (strLen - start <= limit) return false;
		}
		return true;
	}
	function doubleQuotedString(value, ctx) {
		const json = JSON.stringify(value);
		if (ctx.options.doubleQuotedAsJSON) return json;
		const { implicitKey } = ctx;
		const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
		const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
		let str = "";
		let start = 0;
		for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
			if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
				str += json.slice(start, i) + "\\ ";
				i += 1;
				start = i;
				ch = "\\";
			}
			if (ch === "\\") switch (json[i + 1]) {
				case "u":
					{
						str += json.slice(start, i);
						const code = json.substr(i + 2, 4);
						switch (code) {
							case "0000":
								str += "\\0";
								break;
							case "0007":
								str += "\\a";
								break;
							case "000b":
								str += "\\v";
								break;
							case "001b":
								str += "\\e";
								break;
							case "0085":
								str += "\\N";
								break;
							case "00a0":
								str += "\\_";
								break;
							case "2028":
								str += "\\L";
								break;
							case "2029":
								str += "\\P";
								break;
							default: if (code.substr(0, 2) === "00") str += "\\x" + code.substr(2);
							else str += json.substr(i, 6);
						}
						i += 5;
						start = i + 1;
					}
					break;
				case "n":
					if (implicitKey || json[i + 2] === "\"" || json.length < minMultiLineLength) i += 1;
					else {
						str += json.slice(start, i) + "\n\n";
						while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== "\"") {
							str += "\n";
							i += 2;
						}
						str += indent;
						if (json[i + 2] === " ") str += "\\";
						i += 1;
						start = i + 1;
					}
					break;
				default: i += 1;
			}
		}
		str = start ? str + json.slice(start) : json;
		return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
	}
	function singleQuotedString(value, ctx) {
		if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value)) return doubleQuotedString(value, ctx);
		const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
		const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&\n${indent}`) + "'";
		return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
	}
	function quotedString(value, ctx) {
		const { singleQuote } = ctx.options;
		let qs;
		if (singleQuote === false) qs = doubleQuotedString;
		else {
			const hasDouble = value.includes("\"");
			const hasSingle = value.includes("'");
			if (hasDouble && !hasSingle) qs = singleQuotedString;
			else if (hasSingle && !hasDouble) qs = doubleQuotedString;
			else qs = singleQuote ? singleQuotedString : doubleQuotedString;
		}
		return qs(value, ctx);
	}
	var blockEndNewlines;
	try {
		blockEndNewlines = /* @__PURE__ */ new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
	} catch {
		blockEndNewlines = /\n+(?!\n|$)/g;
	}
	function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
		const { blockQuote, commentString, lineWidth } = ctx.options;
		if (!blockQuote || /\n[\t ]+$/.test(value)) return quotedString(value, ctx);
		const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
		const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
		if (!value) return literal ? "|\n" : ">\n";
		let chomp;
		let endStart;
		for (endStart = value.length; endStart > 0; --endStart) {
			const ch = value[endStart - 1];
			if (ch !== "\n" && ch !== "	" && ch !== " ") break;
		}
		let end = value.substring(endStart);
		const endNlPos = end.indexOf("\n");
		if (endNlPos === -1) chomp = "-";
		else if (value === end || endNlPos !== end.length - 1) {
			chomp = "+";
			if (onChompKeep) onChompKeep();
		} else chomp = "";
		if (end) {
			value = value.slice(0, -end.length);
			if (end[end.length - 1] === "\n") end = end.slice(0, -1);
			end = end.replace(blockEndNewlines, `$&${indent}`);
		}
		let startWithSpace = false;
		let startEnd;
		let startNlPos = -1;
		for (startEnd = 0; startEnd < value.length; ++startEnd) {
			const ch = value[startEnd];
			if (ch === " ") startWithSpace = true;
			else if (ch === "\n") startNlPos = startEnd;
			else break;
		}
		let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
		if (start) {
			value = value.substring(start.length);
			start = start.replace(/\n+/g, `$&${indent}`);
		}
		let header = (startWithSpace ? indent ? "2" : "1" : "") + chomp;
		if (comment) {
			header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
			if (onComment) onComment();
		}
		if (!literal) {
			const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
			let literalFallback = false;
			const foldOptions = getFoldOptions(ctx, true);
			if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) foldOptions.onOverflow = () => {
				literalFallback = true;
			};
			const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
			if (!literalFallback) return `>${header}\n${indent}${body}`;
		}
		value = value.replace(/\n+/g, `$&${indent}`);
		return `|${header}\n${indent}${start}${value}${end}`;
	}
	function plainString(item, ctx, onComment, onChompKeep) {
		const { type, value } = item;
		const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
		if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) return quotedString(value, ctx);
		if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
		if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) return blockString(item, ctx, onComment, onChompKeep);
		if (containsDocumentMarker(value)) {
			if (indent === "") {
				ctx.forceBlockIndent = true;
				return blockString(item, ctx, onComment, onChompKeep);
			} else if (implicitKey && indent === indentStep) return quotedString(value, ctx);
		}
		const str = value.replace(/\n+/g, `$&\n${indent}`);
		if (actualString) {
			const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
			const { compat, tags } = ctx.doc.schema;
			if (tags.some(test) || compat?.some(test)) return quotedString(value, ctx);
		}
		return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
	}
	function stringifyString(item, ctx, onComment, onChompKeep) {
		const { implicitKey, inFlow } = ctx;
		const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
		let { type } = item;
		if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
			if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value)) type = Scalar.Scalar.QUOTE_DOUBLE;
		}
		const _stringify = (_type) => {
			switch (_type) {
				case Scalar.Scalar.BLOCK_FOLDED:
				case Scalar.Scalar.BLOCK_LITERAL: return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
				case Scalar.Scalar.QUOTE_DOUBLE: return doubleQuotedString(ss.value, ctx);
				case Scalar.Scalar.QUOTE_SINGLE: return singleQuotedString(ss.value, ctx);
				case Scalar.Scalar.PLAIN: return plainString(ss, ctx, onComment, onChompKeep);
				default: return null;
			}
		};
		let res = _stringify(type);
		if (res === null) {
			const { defaultKeyType, defaultStringType } = ctx.options;
			const t = implicitKey && defaultKeyType || defaultStringType;
			res = _stringify(t);
			if (res === null) throw new Error(`Unsupported default string type ${t}`);
		}
		return res;
	}
	exports.stringifyString = stringifyString;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringify.js
var require_stringify = /* @__PURE__ */ __commonJSMin(((exports) => {
	var anchors = require_anchors();
	var identity = require_identity();
	var stringifyComment = require_stringifyComment();
	var stringifyString = require_stringifyString();
	function createStringifyContext(doc, options) {
		const opt = Object.assign({
			blockQuote: true,
			commentString: stringifyComment.stringifyComment,
			defaultKeyType: null,
			defaultStringType: "PLAIN",
			directives: null,
			doubleQuotedAsJSON: false,
			doubleQuotedMinMultiLineLength: 40,
			falseStr: "false",
			flowCollectionPadding: true,
			indentSeq: true,
			lineWidth: 80,
			minContentWidth: 20,
			nullStr: "null",
			simpleKeys: false,
			singleQuote: null,
			trailingComma: false,
			trueStr: "true",
			verifyAliasOrder: true
		}, doc.schema.toStringOptions, options);
		let inFlow;
		switch (opt.collectionStyle) {
			case "block":
				inFlow = false;
				break;
			case "flow":
				inFlow = true;
				break;
			default: inFlow = null;
		}
		return {
			anchors: /* @__PURE__ */ new Set(),
			doc,
			flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
			indent: "",
			indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
			inFlow,
			options: opt
		};
	}
	function getTagObject(tags, item) {
		if (item.tag) {
			const match = tags.filter((t) => t.tag === item.tag);
			if (match.length > 0) return match.find((t) => t.format === item.format) ?? match[0];
		}
		let tagObj = void 0;
		let obj;
		if (identity.isScalar(item)) {
			obj = item.value;
			let match = tags.filter((t) => t.identify?.(obj));
			if (match.length > 1) {
				const testMatch = match.filter((t) => t.test);
				if (testMatch.length > 0) match = testMatch;
			}
			tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
		} else {
			obj = item;
			tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
		}
		if (!tagObj) {
			const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
			throw new Error(`Tag not resolved for ${name} value`);
		}
		return tagObj;
	}
	function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
		if (!doc.directives) return "";
		const props = [];
		const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
		if (anchor && anchors.anchorIsValid(anchor)) {
			anchors$1.add(anchor);
			props.push(`&${anchor}`);
		}
		const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
		if (tag) props.push(doc.directives.tagString(tag));
		return props.join(" ");
	}
	function stringify(item, ctx, onComment, onChompKeep) {
		if (identity.isPair(item)) return item.toString(ctx, onComment, onChompKeep);
		if (identity.isAlias(item)) {
			if (ctx.doc.directives) return item.toString(ctx);
			if (ctx.resolvedAliases?.has(item)) throw new TypeError(`Cannot stringify circular structure without alias nodes`);
			else {
				if (ctx.resolvedAliases) ctx.resolvedAliases.add(item);
				else ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
				item = item.resolve(ctx.doc);
			}
		}
		let tagObj = void 0;
		const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
		tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
		const props = stringifyProps(node, tagObj, ctx);
		if (props.length > 0) ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
		const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
		if (!props) return str;
		return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}\n${ctx.indent}${str}`;
	}
	exports.createStringifyContext = createStringifyContext;
	exports.stringify = stringify;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var Scalar = require_Scalar();
	var stringify = require_stringify();
	var stringifyComment = require_stringifyComment();
	function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
		const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
		let keyComment = identity.isNode(key) && key.comment || null;
		if (simpleKeys) {
			if (keyComment) throw new Error("With simple keys, key nodes cannot have comments");
			if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") throw new Error("With simple keys, collection cannot be used as a key value");
		}
		let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
		ctx = Object.assign({}, ctx, {
			allNullValues: false,
			implicitKey: !explicitKey && (simpleKeys || !allNullValues),
			indent: indent + indentStep
		});
		let keyCommentDone = false;
		let chompKeep = false;
		let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
		if (!explicitKey && !ctx.inFlow && str.length > 1024) {
			if (simpleKeys) throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
			explicitKey = true;
		}
		if (ctx.inFlow) {
			if (allNullValues || value == null) {
				if (keyCommentDone && onComment) onComment();
				return str === "" ? "?" : explicitKey ? `? ${str}` : str;
			}
		} else if (allNullValues && !simpleKeys || value == null && explicitKey) {
			str = `? ${str}`;
			if (keyComment && !keyCommentDone) str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
			else if (chompKeep && onChompKeep) onChompKeep();
			return str;
		}
		if (keyCommentDone) keyComment = null;
		if (explicitKey) {
			if (keyComment) str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
			str = `? ${str}\n${indent}:`;
		} else {
			str = `${str}:`;
			if (keyComment) str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
		}
		let vsb, vcb, valueComment;
		if (identity.isNode(value)) {
			vsb = !!value.spaceBefore;
			vcb = value.commentBefore;
			valueComment = value.comment;
		} else {
			vsb = false;
			vcb = null;
			valueComment = null;
			if (value && typeof value === "object") value = doc.createNode(value);
		}
		ctx.implicitKey = false;
		if (!explicitKey && !keyComment && identity.isScalar(value)) ctx.indentAtStart = str.length + 1;
		chompKeep = false;
		if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) ctx.indent = ctx.indent.substring(2);
		let valueCommentDone = false;
		const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
		let ws = " ";
		if (keyComment || vsb || vcb) {
			ws = vsb ? "\n" : "";
			if (vcb) {
				const cs = commentString(vcb);
				ws += `\n${stringifyComment.indentComment(cs, ctx.indent)}`;
			}
			if (valueStr === "" && !ctx.inFlow) {
				if (ws === "\n" && valueComment) ws = "\n\n";
			} else ws += `\n${ctx.indent}`;
		} else if (!explicitKey && identity.isCollection(value)) {
			const vs0 = valueStr[0];
			const nl0 = valueStr.indexOf("\n");
			const hasNewline = nl0 !== -1;
			const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
			if (hasNewline || !flow) {
				let hasPropsLine = false;
				if (hasNewline && (vs0 === "&" || vs0 === "!")) {
					let sp0 = valueStr.indexOf(" ");
					if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") sp0 = valueStr.indexOf(" ", sp0 + 1);
					if (sp0 === -1 || nl0 < sp0) hasPropsLine = true;
				}
				if (!hasPropsLine) ws = `\n${ctx.indent}`;
			}
		} else if (valueStr === "" || valueStr[0] === "\n") ws = "";
		str += ws + valueStr;
		if (ctx.inFlow) {
			if (valueCommentDone && onComment) onComment();
		} else if (valueComment && !valueCommentDone) str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
		else if (chompKeep && onChompKeep) onChompKeep();
		return str;
	}
	exports.stringifyPair = stringifyPair;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/log.js
var require_log = /* @__PURE__ */ __commonJSMin(((exports) => {
	var node_process = __require("process");
	function debug(logLevel, ...messages) {
		if (logLevel === "debug") console.log(...messages);
	}
	function warn(logLevel, warning) {
		if (logLevel === "debug" || logLevel === "warn") {
			if (typeof node_process.emitWarning === "function") node_process.emitWarning(warning);
			else console.warn(warning);
		}
	}
	exports.debug = debug;
	exports.warn = warn;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var Scalar = require_Scalar();
	var MERGE_KEY = "<<";
	var merge = {
		identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
		default: "key",
		tag: "tag:yaml.org,2002:merge",
		test: /^<<$/,
		resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), { addToJSMap: addMergeToJSMap }),
		stringify: () => MERGE_KEY
	};
	var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
	function addMergeToJSMap(ctx, map, value) {
		const source = resolveAliasValue(ctx, value);
		if (identity.isSeq(source)) for (const it of source.items) mergeValue(ctx, map, it);
		else if (Array.isArray(source)) for (const it of source) mergeValue(ctx, map, it);
		else mergeValue(ctx, map, source);
	}
	function mergeValue(ctx, map, value) {
		const source = resolveAliasValue(ctx, value);
		if (!identity.isMap(source)) throw new Error("Merge sources must be maps or map aliases");
		const srcMap = source.toJSON(null, ctx, Map);
		for (const [key, value] of srcMap) if (map instanceof Map) {
			if (!map.has(key)) map.set(key, value);
		} else if (map instanceof Set) map.add(key);
		else if (!Object.prototype.hasOwnProperty.call(map, key)) Object.defineProperty(map, key, {
			value,
			writable: true,
			enumerable: true,
			configurable: true
		});
		return map;
	}
	function resolveAliasValue(ctx, value) {
		return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
	}
	exports.addMergeToJSMap = addMergeToJSMap;
	exports.isMergeKey = isMergeKey;
	exports.merge = merge;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = /* @__PURE__ */ __commonJSMin(((exports) => {
	var log = require_log();
	var merge = require_merge();
	var stringify = require_stringify();
	var identity = require_identity();
	var toJS = require_toJS();
	function addPairToJSMap(ctx, map, { key, value }) {
		if (identity.isNode(key) && key.addToJSMap) key.addToJSMap(ctx, map, value);
		else if (merge.isMergeKey(ctx, key)) merge.addMergeToJSMap(ctx, map, value);
		else {
			const jsKey = toJS.toJS(key, "", ctx);
			if (map instanceof Map) map.set(jsKey, toJS.toJS(value, jsKey, ctx));
			else if (map instanceof Set) map.add(jsKey);
			else {
				const stringKey = stringifyKey(key, jsKey, ctx);
				const jsValue = toJS.toJS(value, stringKey, ctx);
				if (stringKey in map) Object.defineProperty(map, stringKey, {
					value: jsValue,
					writable: true,
					enumerable: true,
					configurable: true
				});
				else map[stringKey] = jsValue;
			}
		}
		return map;
	}
	function stringifyKey(key, jsKey, ctx) {
		if (jsKey === null) return "";
		if (typeof jsKey !== "object") return String(jsKey);
		if (identity.isNode(key) && ctx?.doc) {
			const strCtx = stringify.createStringifyContext(ctx.doc, {});
			strCtx.anchors = /* @__PURE__ */ new Set();
			for (const node of ctx.anchors.keys()) strCtx.anchors.add(node.anchor);
			strCtx.inFlow = true;
			strCtx.inStringifyKey = true;
			const strKey = key.toString(strCtx);
			if (!ctx.mapKeyWarned) {
				let jsonStr = JSON.stringify(strKey);
				if (jsonStr.length > 40) jsonStr = jsonStr.substring(0, 36) + "...\"";
				log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
				ctx.mapKeyWarned = true;
			}
			return strKey;
		}
		return JSON.stringify(jsKey);
	}
	exports.addPairToJSMap = addPairToJSMap;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Pair.js
var require_Pair = /* @__PURE__ */ __commonJSMin(((exports) => {
	var createNode = require_createNode();
	var stringifyPair = require_stringifyPair();
	var addPairToJSMap = require_addPairToJSMap();
	var identity = require_identity();
	function createPair(key, value, ctx) {
		return new Pair(createNode.createNode(key, void 0, ctx), createNode.createNode(value, void 0, ctx));
	}
	var Pair = class Pair {
		constructor(key, value = null) {
			Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
			this.key = key;
			this.value = value;
		}
		clone(schema) {
			let { key, value } = this;
			if (identity.isNode(key)) key = key.clone(schema);
			if (identity.isNode(value)) value = value.clone(schema);
			return new Pair(key, value);
		}
		toJSON(_, ctx) {
			const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
			return addPairToJSMap.addPairToJSMap(ctx, pair, this);
		}
		toString(ctx, onComment, onChompKeep) {
			return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
		}
	};
	exports.Pair = Pair;
	exports.createPair = createPair;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var stringify = require_stringify();
	var stringifyComment = require_stringifyComment();
	function stringifyCollection(collection, ctx, options) {
		return (ctx.inFlow ?? collection.flow ? stringifyFlowCollection : stringifyBlockCollection)(collection, ctx, options);
	}
	function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
		const { indent, options: { commentString } } = ctx;
		const itemCtx = Object.assign({}, ctx, {
			indent: itemIndent,
			type: null
		});
		let chompKeep = false;
		const lines = [];
		for (let i = 0; i < items.length; ++i) {
			const item = items[i];
			let comment = null;
			if (identity.isNode(item)) {
				if (!chompKeep && item.spaceBefore) lines.push("");
				addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
				if (item.comment) comment = item.comment;
			} else if (identity.isPair(item)) {
				const ik = identity.isNode(item.key) ? item.key : null;
				if (ik) {
					if (!chompKeep && ik.spaceBefore) lines.push("");
					addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
				}
			}
			chompKeep = false;
			let str = stringify.stringify(item, itemCtx, () => comment = null, () => chompKeep = true);
			if (comment) str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
			if (chompKeep && comment) chompKeep = false;
			lines.push(blockItemPrefix + str);
		}
		let str;
		if (lines.length === 0) str = flowChars.start + flowChars.end;
		else {
			str = lines[0];
			for (let i = 1; i < lines.length; ++i) {
				const line = lines[i];
				str += line ? `\n${indent}${line}` : "\n";
			}
		}
		if (comment) {
			str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
			if (onComment) onComment();
		} else if (chompKeep && onChompKeep) onChompKeep();
		return str;
	}
	function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
		const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
		itemIndent += indentStep;
		const itemCtx = Object.assign({}, ctx, {
			indent: itemIndent,
			inFlow: true,
			type: null
		});
		let reqNewline = false;
		let linesAtValue = 0;
		const lines = [];
		for (let i = 0; i < items.length; ++i) {
			const item = items[i];
			let comment = null;
			if (identity.isNode(item)) {
				if (item.spaceBefore) lines.push("");
				addCommentBefore(ctx, lines, item.commentBefore, false);
				if (item.comment) comment = item.comment;
			} else if (identity.isPair(item)) {
				const ik = identity.isNode(item.key) ? item.key : null;
				if (ik) {
					if (ik.spaceBefore) lines.push("");
					addCommentBefore(ctx, lines, ik.commentBefore, false);
					if (ik.comment) reqNewline = true;
				}
				const iv = identity.isNode(item.value) ? item.value : null;
				if (iv) {
					if (iv.comment) comment = iv.comment;
					if (iv.commentBefore) reqNewline = true;
				} else if (item.value == null && ik?.comment) comment = ik.comment;
			}
			if (comment) reqNewline = true;
			let str = stringify.stringify(item, itemCtx, () => comment = null);
			reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
			if (i < items.length - 1) str += ",";
			else if (ctx.options.trailingComma) {
				if (ctx.options.lineWidth > 0) reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
				if (reqNewline) str += ",";
			}
			if (comment) str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
			lines.push(str);
			linesAtValue = lines.length;
		}
		const { start, end } = flowChars;
		if (lines.length === 0) return start + end;
		else {
			if (!reqNewline) {
				const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
				reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
			}
			if (reqNewline) {
				let str = start;
				for (const line of lines) str += line ? `\n${indentStep}${indent}${line}` : "\n";
				return `${str}\n${indent}${end}`;
			} else return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
		}
	}
	function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
		if (comment && chompKeep) comment = comment.replace(/^\n+/, "");
		if (comment) {
			const ic = stringifyComment.indentComment(commentString(comment), indent);
			lines.push(ic.trimStart());
		}
	}
	exports.stringifyCollection = stringifyCollection;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = /* @__PURE__ */ __commonJSMin(((exports) => {
	var stringifyCollection = require_stringifyCollection();
	var addPairToJSMap = require_addPairToJSMap();
	var Collection = require_Collection();
	var identity = require_identity();
	var Pair = require_Pair();
	var Scalar = require_Scalar();
	function findPair(items, key) {
		const k = identity.isScalar(key) ? key.value : key;
		for (const it of items) if (identity.isPair(it)) {
			if (it.key === key || it.key === k) return it;
			if (identity.isScalar(it.key) && it.key.value === k) return it;
		}
	}
	var YAMLMap = class extends Collection.Collection {
		static get tagName() {
			return "tag:yaml.org,2002:map";
		}
		constructor(schema) {
			super(identity.MAP, schema);
			this.items = [];
		}
		/**
		* A generic collection parsing method that can be extended
		* to other node classes that inherit from YAMLMap
		*/
		static from(schema, obj, ctx) {
			const { keepUndefined, replacer } = ctx;
			const map = new this(schema);
			const add = (key, value) => {
				if (typeof replacer === "function") value = replacer.call(obj, key, value);
				else if (Array.isArray(replacer) && !replacer.includes(key)) return;
				if (value !== void 0 || keepUndefined) map.items.push(Pair.createPair(key, value, ctx));
			};
			if (obj instanceof Map) for (const [key, value] of obj) add(key, value);
			else if (obj && typeof obj === "object") for (const key of Object.keys(obj)) add(key, obj[key]);
			if (typeof schema.sortMapEntries === "function") map.items.sort(schema.sortMapEntries);
			return map;
		}
		/**
		* Adds a value to the collection.
		*
		* @param overwrite - If not set `true`, using a key that is already in the
		*   collection will throw. Otherwise, overwrites the previous value.
		*/
		add(pair, overwrite) {
			let _pair;
			if (identity.isPair(pair)) _pair = pair;
			else if (!pair || typeof pair !== "object" || !("key" in pair)) _pair = new Pair.Pair(pair, pair?.value);
			else _pair = new Pair.Pair(pair.key, pair.value);
			const prev = findPair(this.items, _pair.key);
			const sortEntries = this.schema?.sortMapEntries;
			if (prev) {
				if (!overwrite) throw new Error(`Key ${_pair.key} already set`);
				if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value)) prev.value.value = _pair.value;
				else prev.value = _pair.value;
			} else if (sortEntries) {
				const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
				if (i === -1) this.items.push(_pair);
				else this.items.splice(i, 0, _pair);
			} else this.items.push(_pair);
		}
		delete(key) {
			const it = findPair(this.items, key);
			if (!it) return false;
			return this.items.splice(this.items.indexOf(it), 1).length > 0;
		}
		get(key, keepScalar) {
			const node = findPair(this.items, key)?.value;
			return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
		}
		has(key) {
			return !!findPair(this.items, key);
		}
		set(key, value) {
			this.add(new Pair.Pair(key, value), true);
		}
		/**
		* @param ctx - Conversion context, originally set in Document#toJS()
		* @param {Class} Type - If set, forces the returned collection type
		* @returns Instance of Type, Map, or Object
		*/
		toJSON(_, ctx, Type) {
			const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
			if (ctx?.onCreate) ctx.onCreate(map);
			for (const item of this.items) addPairToJSMap.addPairToJSMap(ctx, map, item);
			return map;
		}
		toString(ctx, onComment, onChompKeep) {
			if (!ctx) return JSON.stringify(this);
			for (const item of this.items) if (!identity.isPair(item)) throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
			if (!ctx.allNullValues && this.hasAllNullValues(false)) ctx = Object.assign({}, ctx, { allNullValues: true });
			return stringifyCollection.stringifyCollection(this, ctx, {
				blockItemPrefix: "",
				flowChars: {
					start: "{",
					end: "}"
				},
				itemIndent: ctx.indent || "",
				onChompKeep,
				onComment
			});
		}
	};
	exports.YAMLMap = YAMLMap;
	exports.findPair = findPair;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/map.js
var require_map = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var YAMLMap = require_YAMLMap();
	exports.map = {
		collection: "map",
		default: true,
		nodeClass: YAMLMap.YAMLMap,
		tag: "tag:yaml.org,2002:map",
		resolve(map, onError) {
			if (!identity.isMap(map)) onError("Expected a mapping for this tag");
			return map;
		},
		createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
	};
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = /* @__PURE__ */ __commonJSMin(((exports) => {
	var createNode = require_createNode();
	var stringifyCollection = require_stringifyCollection();
	var Collection = require_Collection();
	var identity = require_identity();
	var Scalar = require_Scalar();
	var toJS = require_toJS();
	var YAMLSeq = class extends Collection.Collection {
		static get tagName() {
			return "tag:yaml.org,2002:seq";
		}
		constructor(schema) {
			super(identity.SEQ, schema);
			this.items = [];
		}
		add(value) {
			this.items.push(value);
		}
		/**
		* Removes a value from the collection.
		*
		* `key` must contain a representation of an integer for this to succeed.
		* It may be wrapped in a `Scalar`.
		*
		* @returns `true` if the item was found and removed.
		*/
		delete(key) {
			const idx = asItemIndex(key);
			if (typeof idx !== "number") return false;
			return this.items.splice(idx, 1).length > 0;
		}
		get(key, keepScalar) {
			const idx = asItemIndex(key);
			if (typeof idx !== "number") return void 0;
			const it = this.items[idx];
			return !keepScalar && identity.isScalar(it) ? it.value : it;
		}
		/**
		* Checks if the collection includes a value with the key `key`.
		*
		* `key` must contain a representation of an integer for this to succeed.
		* It may be wrapped in a `Scalar`.
		*/
		has(key) {
			const idx = asItemIndex(key);
			return typeof idx === "number" && idx < this.items.length;
		}
		/**
		* Sets a value in this collection. For `!!set`, `value` needs to be a
		* boolean to add/remove the item from the set.
		*
		* If `key` does not contain a representation of an integer, this will throw.
		* It may be wrapped in a `Scalar`.
		*/
		set(key, value) {
			const idx = asItemIndex(key);
			if (typeof idx !== "number") throw new Error(`Expected a valid index, not ${key}.`);
			const prev = this.items[idx];
			if (identity.isScalar(prev) && Scalar.isScalarValue(value)) prev.value = value;
			else this.items[idx] = value;
		}
		toJSON(_, ctx) {
			const seq = [];
			if (ctx?.onCreate) ctx.onCreate(seq);
			let i = 0;
			for (const item of this.items) seq.push(toJS.toJS(item, String(i++), ctx));
			return seq;
		}
		toString(ctx, onComment, onChompKeep) {
			if (!ctx) return JSON.stringify(this);
			return stringifyCollection.stringifyCollection(this, ctx, {
				blockItemPrefix: "- ",
				flowChars: {
					start: "[",
					end: "]"
				},
				itemIndent: (ctx.indent || "") + "  ",
				onChompKeep,
				onComment
			});
		}
		static from(schema, obj, ctx) {
			const { replacer } = ctx;
			const seq = new this(schema);
			if (obj && Symbol.iterator in Object(obj)) {
				let i = 0;
				for (let it of obj) {
					if (typeof replacer === "function") {
						const key = obj instanceof Set ? it : String(i++);
						it = replacer.call(obj, key, it);
					}
					seq.items.push(createNode.createNode(it, void 0, ctx));
				}
			}
			return seq;
		}
	};
	function asItemIndex(key) {
		let idx = identity.isScalar(key) ? key.value : key;
		if (idx && typeof idx === "string") idx = Number(idx);
		return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
	}
	exports.YAMLSeq = YAMLSeq;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/seq.js
var require_seq = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var YAMLSeq = require_YAMLSeq();
	exports.seq = {
		collection: "seq",
		default: true,
		nodeClass: YAMLSeq.YAMLSeq,
		tag: "tag:yaml.org,2002:seq",
		resolve(seq, onError) {
			if (!identity.isSeq(seq)) onError("Expected a sequence for this tag");
			return seq;
		},
		createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
	};
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/string.js
var require_string = /* @__PURE__ */ __commonJSMin(((exports) => {
	var stringifyString = require_stringifyString();
	exports.string = {
		identify: (value) => typeof value === "string",
		default: true,
		tag: "tag:yaml.org,2002:str",
		resolve: (str) => str,
		stringify(item, ctx, onComment, onChompKeep) {
			ctx = Object.assign({ actualString: true }, ctx);
			return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
		}
	};
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/null.js
var require_null = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Scalar = require_Scalar();
	var nullTag = {
		identify: (value) => value == null,
		createNode: () => new Scalar.Scalar(null),
		default: true,
		tag: "tag:yaml.org,2002:null",
		test: /^(?:~|[Nn]ull|NULL)?$/,
		resolve: () => new Scalar.Scalar(null),
		stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
	};
	exports.nullTag = nullTag;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/bool.js
var require_bool$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Scalar = require_Scalar();
	var boolTag = {
		identify: (value) => typeof value === "boolean",
		default: true,
		tag: "tag:yaml.org,2002:bool",
		test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
		resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
		stringify({ source, value }, ctx) {
			if (source && boolTag.test.test(source)) {
				if (value === (source[0] === "t" || source[0] === "T")) return source;
			}
			return value ? ctx.options.trueStr : ctx.options.falseStr;
		}
	};
	exports.boolTag = boolTag;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = /* @__PURE__ */ __commonJSMin(((exports) => {
	function stringifyNumber({ format, minFractionDigits, tag, value }) {
		if (typeof value === "bigint") return String(value);
		const num = typeof value === "number" ? value : Number(value);
		if (!isFinite(num)) return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
		let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
		if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
			let i = n.indexOf(".");
			if (i < 0) {
				i = n.length;
				n += ".";
			}
			let d = minFractionDigits - (n.length - i - 1);
			while (d-- > 0) n += "0";
		}
		return n;
	}
	exports.stringifyNumber = stringifyNumber;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/float.js
var require_float$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Scalar = require_Scalar();
	var stringifyNumber = require_stringifyNumber();
	var floatNaN = {
		identify: (value) => typeof value === "number",
		default: true,
		tag: "tag:yaml.org,2002:float",
		test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
		resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
		stringify: stringifyNumber.stringifyNumber
	};
	var floatExp = {
		identify: (value) => typeof value === "number",
		default: true,
		tag: "tag:yaml.org,2002:float",
		format: "EXP",
		test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
		resolve: (str) => parseFloat(str),
		stringify(node) {
			const num = Number(node.value);
			return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
		}
	};
	exports.float = {
		identify: (value) => typeof value === "number",
		default: true,
		tag: "tag:yaml.org,2002:float",
		test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
		resolve(str) {
			const node = new Scalar.Scalar(parseFloat(str));
			const dot = str.indexOf(".");
			if (dot !== -1 && str[str.length - 1] === "0") node.minFractionDigits = str.length - dot - 1;
			return node;
		},
		stringify: stringifyNumber.stringifyNumber
	};
	exports.floatExp = floatExp;
	exports.floatNaN = floatNaN;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/int.js
var require_int$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var stringifyNumber = require_stringifyNumber();
	var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
	var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
	function intStringify(node, radix, prefix) {
		const { value } = node;
		if (intIdentify(value) && value >= 0) return prefix + value.toString(radix);
		return stringifyNumber.stringifyNumber(node);
	}
	var intOct = {
		identify: (value) => intIdentify(value) && value >= 0,
		default: true,
		tag: "tag:yaml.org,2002:int",
		format: "OCT",
		test: /^0o[0-7]+$/,
		resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
		stringify: (node) => intStringify(node, 8, "0o")
	};
	var int = {
		identify: intIdentify,
		default: true,
		tag: "tag:yaml.org,2002:int",
		test: /^[-+]?[0-9]+$/,
		resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
		stringify: stringifyNumber.stringifyNumber
	};
	var intHex = {
		identify: (value) => intIdentify(value) && value >= 0,
		default: true,
		tag: "tag:yaml.org,2002:int",
		format: "HEX",
		test: /^0x[0-9a-fA-F]+$/,
		resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
		stringify: (node) => intStringify(node, 16, "0x")
	};
	exports.int = int;
	exports.intHex = intHex;
	exports.intOct = intOct;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/schema.js
var require_schema$2 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var map = require_map();
	var _null = require_null();
	var seq = require_seq();
	var string = require_string();
	var bool = require_bool$1();
	var float = require_float$1();
	var int = require_int$1();
	exports.schema = [
		map.map,
		seq.seq,
		string.string,
		_null.nullTag,
		bool.boolTag,
		int.intOct,
		int.int,
		int.intHex,
		float.floatNaN,
		float.floatExp,
		float.float
	];
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/json/schema.js
var require_schema$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Scalar = require_Scalar();
	var map = require_map();
	var seq = require_seq();
	function intIdentify(value) {
		return typeof value === "bigint" || Number.isInteger(value);
	}
	var stringifyJSON = ({ value }) => JSON.stringify(value);
	var jsonScalars = [
		{
			identify: (value) => typeof value === "string",
			default: true,
			tag: "tag:yaml.org,2002:str",
			resolve: (str) => str,
			stringify: stringifyJSON
		},
		{
			identify: (value) => value == null,
			createNode: () => new Scalar.Scalar(null),
			default: true,
			tag: "tag:yaml.org,2002:null",
			test: /^null$/,
			resolve: () => null,
			stringify: stringifyJSON
		},
		{
			identify: (value) => typeof value === "boolean",
			default: true,
			tag: "tag:yaml.org,2002:bool",
			test: /^true$|^false$/,
			resolve: (str) => str === "true",
			stringify: stringifyJSON
		},
		{
			identify: intIdentify,
			default: true,
			tag: "tag:yaml.org,2002:int",
			test: /^-?(?:0|[1-9][0-9]*)$/,
			resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
			stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
		},
		{
			identify: (value) => typeof value === "number",
			default: true,
			tag: "tag:yaml.org,2002:float",
			test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
			resolve: (str) => parseFloat(str),
			stringify: stringifyJSON
		}
	];
	exports.schema = [map.map, seq.seq].concat(jsonScalars, {
		default: true,
		tag: "",
		test: /^/,
		resolve(str, onError) {
			onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
			return str;
		}
	});
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = /* @__PURE__ */ __commonJSMin(((exports) => {
	var node_buffer = __require("buffer");
	var Scalar = require_Scalar();
	var stringifyString = require_stringifyString();
	exports.binary = {
		identify: (value) => value instanceof Uint8Array,
		default: false,
		tag: "tag:yaml.org,2002:binary",
		/**
		* Returns a Buffer in node and an Uint8Array in browsers
		*
		* To use the resulting buffer as an image, you'll want to do something like:
		*
		*   const blob = new Blob([buffer], { type: 'image/jpeg' })
		*   document.querySelector('#photo').src = URL.createObjectURL(blob)
		*/
		resolve(src, onError) {
			if (typeof node_buffer.Buffer === "function") return node_buffer.Buffer.from(src, "base64");
			else if (typeof atob === "function") {
				const str = atob(src.replace(/[\n\r]/g, ""));
				const buffer = new Uint8Array(str.length);
				for (let i = 0; i < str.length; ++i) buffer[i] = str.charCodeAt(i);
				return buffer;
			} else {
				onError("This environment does not support reading binary tags; either Buffer or atob is required");
				return src;
			}
		},
		stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
			if (!value) return "";
			const buf = value;
			let str;
			if (typeof node_buffer.Buffer === "function") str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
			else if (typeof btoa === "function") {
				let s = "";
				for (let i = 0; i < buf.length; ++i) s += String.fromCharCode(buf[i]);
				str = btoa(s);
			} else throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
			type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
			if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
				const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
				const n = Math.ceil(str.length / lineWidth);
				const lines = new Array(n);
				for (let i = 0, o = 0; i < n; ++i, o += lineWidth) lines[i] = str.substr(o, lineWidth);
				str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
			}
			return stringifyString.stringifyString({
				comment,
				type,
				value: str
			}, ctx, onComment, onChompKeep);
		}
	};
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var Pair = require_Pair();
	var Scalar = require_Scalar();
	var YAMLSeq = require_YAMLSeq();
	function resolvePairs(seq, onError) {
		if (identity.isSeq(seq)) for (let i = 0; i < seq.items.length; ++i) {
			let item = seq.items[i];
			if (identity.isPair(item)) continue;
			else if (identity.isMap(item)) {
				if (item.items.length > 1) onError("Each pair must have its own sequence indicator");
				const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
				if (item.commentBefore) pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}\n${pair.key.commentBefore}` : item.commentBefore;
				if (item.comment) {
					const cn = pair.value ?? pair.key;
					cn.comment = cn.comment ? `${item.comment}\n${cn.comment}` : item.comment;
				}
				item = pair;
			}
			seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
		}
		else onError("Expected a sequence for this tag");
		return seq;
	}
	function createPairs(schema, iterable, ctx) {
		const { replacer } = ctx;
		const pairs = new YAMLSeq.YAMLSeq(schema);
		pairs.tag = "tag:yaml.org,2002:pairs";
		let i = 0;
		if (iterable && Symbol.iterator in Object(iterable)) for (let it of iterable) {
			if (typeof replacer === "function") it = replacer.call(iterable, String(i++), it);
			let key, value;
			if (Array.isArray(it)) {
				if (it.length === 2) {
					key = it[0];
					value = it[1];
				} else throw new TypeError(`Expected [key, value] tuple: ${it}`);
			} else if (it && it instanceof Object) {
				const keys = Object.keys(it);
				if (keys.length === 1) {
					key = keys[0];
					value = it[key];
				} else throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
			} else key = it;
			pairs.items.push(Pair.createPair(key, value, ctx));
		}
		return pairs;
	}
	var pairs = {
		collection: "seq",
		default: false,
		tag: "tag:yaml.org,2002:pairs",
		resolve: resolvePairs,
		createNode: createPairs
	};
	exports.createPairs = createPairs;
	exports.pairs = pairs;
	exports.resolvePairs = resolvePairs;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var toJS = require_toJS();
	var YAMLMap = require_YAMLMap();
	var YAMLSeq = require_YAMLSeq();
	var pairs = require_pairs();
	var YAMLOMap = class YAMLOMap extends YAMLSeq.YAMLSeq {
		constructor() {
			super();
			this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
			this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
			this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
			this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
			this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
			this.tag = YAMLOMap.tag;
		}
		/**
		* If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
		* but TypeScript won't allow widening the signature of a child method.
		*/
		toJSON(_, ctx) {
			if (!ctx) return super.toJSON(_);
			const map = /* @__PURE__ */ new Map();
			if (ctx?.onCreate) ctx.onCreate(map);
			for (const pair of this.items) {
				let key, value;
				if (identity.isPair(pair)) {
					key = toJS.toJS(pair.key, "", ctx);
					value = toJS.toJS(pair.value, key, ctx);
				} else key = toJS.toJS(pair, "", ctx);
				if (map.has(key)) throw new Error("Ordered maps must not include duplicate keys");
				map.set(key, value);
			}
			return map;
		}
		static from(schema, iterable, ctx) {
			const pairs$1 = pairs.createPairs(schema, iterable, ctx);
			const omap = new this();
			omap.items = pairs$1.items;
			return omap;
		}
	};
	YAMLOMap.tag = "tag:yaml.org,2002:omap";
	var omap = {
		collection: "seq",
		identify: (value) => value instanceof Map,
		nodeClass: YAMLOMap,
		default: false,
		tag: "tag:yaml.org,2002:omap",
		resolve(seq, onError) {
			const pairs$1 = pairs.resolvePairs(seq, onError);
			const seenKeys = [];
			for (const { key } of pairs$1.items) if (identity.isScalar(key)) {
				if (seenKeys.includes(key.value)) onError(`Ordered maps must not include duplicate keys: ${key.value}`);
				else seenKeys.push(key.value);
			}
			return Object.assign(new YAMLOMap(), pairs$1);
		},
		createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
	};
	exports.YAMLOMap = YAMLOMap;
	exports.omap = omap;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Scalar = require_Scalar();
	function boolStringify({ value, source }, ctx) {
		if (source && (value ? trueTag : falseTag).test.test(source)) return source;
		return value ? ctx.options.trueStr : ctx.options.falseStr;
	}
	var trueTag = {
		identify: (value) => value === true,
		default: true,
		tag: "tag:yaml.org,2002:bool",
		test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
		resolve: () => new Scalar.Scalar(true),
		stringify: boolStringify
	};
	var falseTag = {
		identify: (value) => value === false,
		default: true,
		tag: "tag:yaml.org,2002:bool",
		test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
		resolve: () => new Scalar.Scalar(false),
		stringify: boolStringify
	};
	exports.falseTag = falseTag;
	exports.trueTag = trueTag;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Scalar = require_Scalar();
	var stringifyNumber = require_stringifyNumber();
	var floatNaN = {
		identify: (value) => typeof value === "number",
		default: true,
		tag: "tag:yaml.org,2002:float",
		test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
		resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
		stringify: stringifyNumber.stringifyNumber
	};
	var floatExp = {
		identify: (value) => typeof value === "number",
		default: true,
		tag: "tag:yaml.org,2002:float",
		format: "EXP",
		test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
		resolve: (str) => parseFloat(str.replace(/_/g, "")),
		stringify(node) {
			const num = Number(node.value);
			return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
		}
	};
	exports.float = {
		identify: (value) => typeof value === "number",
		default: true,
		tag: "tag:yaml.org,2002:float",
		test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
		resolve(str) {
			const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
			const dot = str.indexOf(".");
			if (dot !== -1) {
				const f = str.substring(dot + 1).replace(/_/g, "");
				if (f[f.length - 1] === "0") node.minFractionDigits = f.length;
			}
			return node;
		},
		stringify: stringifyNumber.stringifyNumber
	};
	exports.floatExp = floatExp;
	exports.floatNaN = floatNaN;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int = /* @__PURE__ */ __commonJSMin(((exports) => {
	var stringifyNumber = require_stringifyNumber();
	var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
	function intResolve(str, offset, radix, { intAsBigInt }) {
		const sign = str[0];
		if (sign === "-" || sign === "+") offset += 1;
		str = str.substring(offset).replace(/_/g, "");
		if (intAsBigInt) {
			switch (radix) {
				case 2:
					str = `0b${str}`;
					break;
				case 8:
					str = `0o${str}`;
					break;
				case 16: str = `0x${str}`;
			}
			const n = BigInt(str);
			return sign === "-" ? BigInt(-1) * n : n;
		}
		const n = parseInt(str, radix);
		return sign === "-" ? -1 * n : n;
	}
	function intStringify(node, radix, prefix) {
		const { value } = node;
		if (intIdentify(value)) {
			const str = value.toString(radix);
			return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
		}
		return stringifyNumber.stringifyNumber(node);
	}
	var intBin = {
		identify: intIdentify,
		default: true,
		tag: "tag:yaml.org,2002:int",
		format: "BIN",
		test: /^[-+]?0b[0-1_]+$/,
		resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
		stringify: (node) => intStringify(node, 2, "0b")
	};
	var intOct = {
		identify: intIdentify,
		default: true,
		tag: "tag:yaml.org,2002:int",
		format: "OCT",
		test: /^[-+]?0[0-7_]+$/,
		resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
		stringify: (node) => intStringify(node, 8, "0")
	};
	var int = {
		identify: intIdentify,
		default: true,
		tag: "tag:yaml.org,2002:int",
		test: /^[-+]?[0-9][0-9_]*$/,
		resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
		stringify: stringifyNumber.stringifyNumber
	};
	var intHex = {
		identify: intIdentify,
		default: true,
		tag: "tag:yaml.org,2002:int",
		format: "HEX",
		test: /^[-+]?0x[0-9a-fA-F_]+$/,
		resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
		stringify: (node) => intStringify(node, 16, "0x")
	};
	exports.int = int;
	exports.intBin = intBin;
	exports.intHex = intHex;
	exports.intOct = intOct;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var Pair = require_Pair();
	var YAMLMap = require_YAMLMap();
	var YAMLSet = class YAMLSet extends YAMLMap.YAMLMap {
		constructor(schema) {
			super(schema);
			this.tag = YAMLSet.tag;
		}
		add(key) {
			let pair;
			if (identity.isPair(key)) pair = key;
			else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null) pair = new Pair.Pair(key.key, null);
			else pair = new Pair.Pair(key, null);
			if (!YAMLMap.findPair(this.items, pair.key)) this.items.push(pair);
		}
		/**
		* If `keepPair` is `true`, returns the Pair matching `key`.
		* Otherwise, returns the value of that Pair's key.
		*/
		get(key, keepPair) {
			const pair = YAMLMap.findPair(this.items, key);
			return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
		}
		set(key, value) {
			if (typeof value !== "boolean") throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
			const prev = YAMLMap.findPair(this.items, key);
			if (prev && !value) this.items.splice(this.items.indexOf(prev), 1);
			else if (!prev && value) this.items.push(new Pair.Pair(key));
		}
		toJSON(_, ctx) {
			return super.toJSON(_, ctx, Set);
		}
		toString(ctx, onComment, onChompKeep) {
			if (!ctx) return JSON.stringify(this);
			if (this.hasAllNullValues(true)) return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
			else throw new Error("Set items must all have null values");
		}
		static from(schema, iterable, ctx) {
			const { replacer } = ctx;
			const set = new this(schema);
			if (iterable && Symbol.iterator in Object(iterable)) for (let value of iterable) {
				if (typeof replacer === "function") value = replacer.call(iterable, value, value);
				set.items.push(Pair.createPair(value, null, ctx));
			}
			return set;
		}
	};
	YAMLSet.tag = "tag:yaml.org,2002:set";
	var set = {
		collection: "map",
		identify: (value) => value instanceof Set,
		nodeClass: YAMLSet,
		default: false,
		tag: "tag:yaml.org,2002:set",
		createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
		resolve(map, onError) {
			if (identity.isMap(map)) {
				if (map.hasAllNullValues(true)) return Object.assign(new YAMLSet(), map);
				else onError("Set items must all have null values");
			} else onError("Expected a mapping for this tag");
			return map;
		}
	};
	exports.YAMLSet = YAMLSet;
	exports.set = set;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = /* @__PURE__ */ __commonJSMin(((exports) => {
	var stringifyNumber = require_stringifyNumber();
	/** Internal types handle bigint as number, because TS can't figure it out. */
	function parseSexagesimal(str, asBigInt) {
		const sign = str[0];
		const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
		const num = (n) => asBigInt ? BigInt(n) : Number(n);
		const res = parts.replace(/_/g, "").split(":").reduce((res, p) => res * num(60) + num(p), num(0));
		return sign === "-" ? num(-1) * res : res;
	}
	/**
	* hhhh:mm:ss.sss
	*
	* Internal types handle bigint as number, because TS can't figure it out.
	*/
	function stringifySexagesimal(node) {
		let { value } = node;
		let num = (n) => n;
		if (typeof value === "bigint") num = (n) => BigInt(n);
		else if (isNaN(value) || !isFinite(value)) return stringifyNumber.stringifyNumber(node);
		let sign = "";
		if (value < 0) {
			sign = "-";
			value *= num(-1);
		}
		const _60 = num(60);
		const parts = [value % _60];
		if (value < 60) parts.unshift(0);
		else {
			value = (value - parts[0]) / _60;
			parts.unshift(value % _60);
			if (value >= 60) {
				value = (value - parts[0]) / _60;
				parts.unshift(value);
			}
		}
		return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
	}
	var intTime = {
		identify: (value) => typeof value === "bigint" || Number.isInteger(value),
		default: true,
		tag: "tag:yaml.org,2002:int",
		format: "TIME",
		test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
		resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
		stringify: stringifySexagesimal
	};
	var floatTime = {
		identify: (value) => typeof value === "number",
		default: true,
		tag: "tag:yaml.org,2002:float",
		format: "TIME",
		test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
		resolve: (str) => parseSexagesimal(str, false),
		stringify: stringifySexagesimal
	};
	var timestamp = {
		identify: (value) => value instanceof Date,
		default: true,
		tag: "tag:yaml.org,2002:timestamp",
		test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
		resolve(str) {
			const match = str.match(timestamp.test);
			if (!match) throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
			const [, year, month, day, hour, minute, second] = match.map(Number);
			const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
			let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
			const tz = match[8];
			if (tz && tz !== "Z") {
				let d = parseSexagesimal(tz, false);
				if (Math.abs(d) < 30) d *= 60;
				date -= 6e4 * d;
			}
			return new Date(date);
		},
		stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
	};
	exports.floatTime = floatTime;
	exports.intTime = intTime;
	exports.timestamp = timestamp;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema = /* @__PURE__ */ __commonJSMin(((exports) => {
	var map = require_map();
	var _null = require_null();
	var seq = require_seq();
	var string = require_string();
	var binary = require_binary();
	var bool = require_bool();
	var float = require_float();
	var int = require_int();
	var merge = require_merge();
	var omap = require_omap();
	var pairs = require_pairs();
	var set = require_set();
	var timestamp = require_timestamp();
	exports.schema = [
		map.map,
		seq.seq,
		string.string,
		_null.nullTag,
		bool.trueTag,
		bool.falseTag,
		int.intBin,
		int.intOct,
		int.int,
		int.intHex,
		float.floatNaN,
		float.floatExp,
		float.float,
		binary.binary,
		merge.merge,
		omap.omap,
		pairs.pairs,
		set.set,
		timestamp.intTime,
		timestamp.floatTime,
		timestamp.timestamp
	];
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/tags.js
var require_tags = /* @__PURE__ */ __commonJSMin(((exports) => {
	var map = require_map();
	var _null = require_null();
	var seq = require_seq();
	var string = require_string();
	var bool = require_bool$1();
	var float = require_float$1();
	var int = require_int$1();
	var schema = require_schema$2();
	var schema$1 = require_schema$1();
	var binary = require_binary();
	var merge = require_merge();
	var omap = require_omap();
	var pairs = require_pairs();
	var schema$2 = require_schema();
	var set = require_set();
	var timestamp = require_timestamp();
	var schemas = /* @__PURE__ */ new Map([
		["core", schema.schema],
		["failsafe", [
			map.map,
			seq.seq,
			string.string
		]],
		["json", schema$1.schema],
		["yaml11", schema$2.schema],
		["yaml-1.1", schema$2.schema]
	]);
	var tagsByName = {
		binary: binary.binary,
		bool: bool.boolTag,
		float: float.float,
		floatExp: float.floatExp,
		floatNaN: float.floatNaN,
		floatTime: timestamp.floatTime,
		int: int.int,
		intHex: int.intHex,
		intOct: int.intOct,
		intTime: timestamp.intTime,
		map: map.map,
		merge: merge.merge,
		null: _null.nullTag,
		omap: omap.omap,
		pairs: pairs.pairs,
		seq: seq.seq,
		set: set.set,
		timestamp: timestamp.timestamp
	};
	var coreKnownTags = {
		"tag:yaml.org,2002:binary": binary.binary,
		"tag:yaml.org,2002:merge": merge.merge,
		"tag:yaml.org,2002:omap": omap.omap,
		"tag:yaml.org,2002:pairs": pairs.pairs,
		"tag:yaml.org,2002:set": set.set,
		"tag:yaml.org,2002:timestamp": timestamp.timestamp
	};
	function getTags(customTags, schemaName, addMergeTag) {
		const schemaTags = schemas.get(schemaName);
		if (schemaTags && !customTags) return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
		let tags = schemaTags;
		if (!tags) {
			if (Array.isArray(customTags)) tags = [];
			else {
				const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
				throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
			}
		}
		if (Array.isArray(customTags)) for (const tag of customTags) tags = tags.concat(tag);
		else if (typeof customTags === "function") tags = customTags(tags.slice());
		if (addMergeTag) tags = tags.concat(merge.merge);
		return tags.reduce((tags, tag) => {
			const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
			if (!tagObj) {
				const tagName = JSON.stringify(tag);
				const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
				throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
			}
			if (!tags.includes(tagObj)) tags.push(tagObj);
			return tags;
		}, []);
	}
	exports.coreKnownTags = coreKnownTags;
	exports.getTags = getTags;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/Schema.js
var require_Schema = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var map = require_map();
	var seq = require_seq();
	var string = require_string();
	var tags = require_tags();
	var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
	exports.Schema = class Schema {
		constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
			this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
			this.name = typeof schema === "string" && schema || "core";
			this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
			this.tags = tags.getTags(customTags, this.name, merge);
			this.toStringOptions = toStringDefaults ?? null;
			Object.defineProperty(this, identity.MAP, { value: map.map });
			Object.defineProperty(this, identity.SCALAR, { value: string.string });
			Object.defineProperty(this, identity.SEQ, { value: seq.seq });
			this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
		}
		clone() {
			const copy = Object.create(Schema.prototype, Object.getOwnPropertyDescriptors(this));
			copy.tags = this.tags.slice();
			return copy;
		}
	};
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var stringify = require_stringify();
	var stringifyComment = require_stringifyComment();
	function stringifyDocument(doc, options) {
		const lines = [];
		let hasDirectives = options.directives === true;
		if (options.directives !== false && doc.directives) {
			const dir = doc.directives.toString(doc);
			if (dir) {
				lines.push(dir);
				hasDirectives = true;
			} else if (doc.directives.docStart) hasDirectives = true;
		}
		if (hasDirectives) lines.push("---");
		const ctx = stringify.createStringifyContext(doc, options);
		const { commentString } = ctx.options;
		if (doc.commentBefore) {
			if (lines.length !== 1) lines.unshift("");
			const cs = commentString(doc.commentBefore);
			lines.unshift(stringifyComment.indentComment(cs, ""));
		}
		let chompKeep = false;
		let contentComment = null;
		if (doc.contents) {
			if (identity.isNode(doc.contents)) {
				if (doc.contents.spaceBefore && hasDirectives) lines.push("");
				if (doc.contents.commentBefore) {
					const cs = commentString(doc.contents.commentBefore);
					lines.push(stringifyComment.indentComment(cs, ""));
				}
				ctx.forceBlockIndent = !!doc.comment;
				contentComment = doc.contents.comment;
			}
			const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
			let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
			if (contentComment) body += stringifyComment.lineComment(body, "", commentString(contentComment));
			if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") lines[lines.length - 1] = `--- ${body}`;
			else lines.push(body);
		} else lines.push(stringify.stringify(doc.contents, ctx));
		if (doc.directives?.docEnd) {
			if (doc.comment) {
				const cs = commentString(doc.comment);
				if (cs.includes("\n")) {
					lines.push("...");
					lines.push(stringifyComment.indentComment(cs, ""));
				} else lines.push(`... ${cs}`);
			} else lines.push("...");
		} else {
			let dc = doc.comment;
			if (dc && chompKeep) dc = dc.replace(/^\n+/, "");
			if (dc) {
				if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "") lines.push("");
				lines.push(stringifyComment.indentComment(commentString(dc), ""));
			}
		}
		return lines.join("\n") + "\n";
	}
	exports.stringifyDocument = stringifyDocument;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/Document.js
var require_Document = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Alias = require_Alias();
	var Collection = require_Collection();
	var identity = require_identity();
	var Pair = require_Pair();
	var toJS = require_toJS();
	var Schema = require_Schema();
	var stringifyDocument = require_stringifyDocument();
	var anchors = require_anchors();
	var applyReviver = require_applyReviver();
	var createNode = require_createNode();
	var directives = require_directives();
	var Document = class Document {
		constructor(value, replacer, options) {
			/** A comment before this Document */
			this.commentBefore = null;
			/** A comment immediately after this Document */
			this.comment = null;
			/** Errors encountered during parsing. */
			this.errors = [];
			/** Warnings encountered during parsing. */
			this.warnings = [];
			Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
			let _replacer = null;
			if (typeof replacer === "function" || Array.isArray(replacer)) _replacer = replacer;
			else if (options === void 0 && replacer) {
				options = replacer;
				replacer = void 0;
			}
			const opt = Object.assign({
				intAsBigInt: false,
				keepSourceTokens: false,
				logLevel: "warn",
				prettyErrors: true,
				strict: true,
				stringKeys: false,
				uniqueKeys: true,
				version: "1.2"
			}, options);
			this.options = opt;
			let { version } = opt;
			if (options?._directives) {
				this.directives = options._directives.atDocument();
				if (this.directives.yaml.explicit) version = this.directives.yaml.version;
			} else this.directives = new directives.Directives({ version });
			this.setSchema(version, options);
			this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
		}
		/**
		* Create a deep copy of this Document and its contents.
		*
		* Custom Node values that inherit from `Object` still refer to their original instances.
		*/
		clone() {
			const copy = Object.create(Document.prototype, { [identity.NODE_TYPE]: { value: identity.DOC } });
			copy.commentBefore = this.commentBefore;
			copy.comment = this.comment;
			copy.errors = this.errors.slice();
			copy.warnings = this.warnings.slice();
			copy.options = Object.assign({}, this.options);
			if (this.directives) copy.directives = this.directives.clone();
			copy.schema = this.schema.clone();
			copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
			if (this.range) copy.range = this.range.slice();
			return copy;
		}
		/** Adds a value to the document. */
		add(value) {
			if (assertCollection(this.contents)) this.contents.add(value);
		}
		/** Adds a value to the document. */
		addIn(path, value) {
			if (assertCollection(this.contents)) this.contents.addIn(path, value);
		}
		/**
		* Create a new `Alias` node, ensuring that the target `node` has the required anchor.
		*
		* If `node` already has an anchor, `name` is ignored.
		* Otherwise, the `node.anchor` value will be set to `name`,
		* or if an anchor with that name is already present in the document,
		* `name` will be used as a prefix for a new unique anchor.
		* If `name` is undefined, the generated anchor will use 'a' as a prefix.
		*/
		createAlias(node, name) {
			if (!node.anchor) {
				const prev = anchors.anchorNames(this);
				node.anchor = !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
			}
			return new Alias.Alias(node.anchor);
		}
		createNode(value, replacer, options) {
			let _replacer = void 0;
			if (typeof replacer === "function") {
				value = replacer.call({ "": value }, "", value);
				_replacer = replacer;
			} else if (Array.isArray(replacer)) {
				const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
				const asStr = replacer.filter(keyToStr).map(String);
				if (asStr.length > 0) replacer = replacer.concat(asStr);
				_replacer = replacer;
			} else if (options === void 0 && replacer) {
				options = replacer;
				replacer = void 0;
			}
			const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
			const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(this, anchorPrefix || "a");
			const ctx = {
				aliasDuplicateObjects: aliasDuplicateObjects ?? true,
				keepUndefined: keepUndefined ?? false,
				onAnchor,
				onTagObj,
				replacer: _replacer,
				schema: this.schema,
				sourceObjects
			};
			const node = createNode.createNode(value, tag, ctx);
			if (flow && identity.isCollection(node)) node.flow = true;
			setAnchors();
			return node;
		}
		/**
		* Convert a key and a value into a `Pair` using the current schema,
		* recursively wrapping all values as `Scalar` or `Collection` nodes.
		*/
		createPair(key, value, options = {}) {
			const k = this.createNode(key, null, options);
			const v = this.createNode(value, null, options);
			return new Pair.Pair(k, v);
		}
		/**
		* Removes a value from the document.
		* @returns `true` if the item was found and removed.
		*/
		delete(key) {
			return assertCollection(this.contents) ? this.contents.delete(key) : false;
		}
		/**
		* Removes a value from the document.
		* @returns `true` if the item was found and removed.
		*/
		deleteIn(path) {
			if (Collection.isEmptyPath(path)) {
				if (this.contents == null) return false;
				this.contents = null;
				return true;
			}
			return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
		}
		/**
		* Returns item at `key`, or `undefined` if not found. By default unwraps
		* scalar values from their surrounding node; to disable set `keepScalar` to
		* `true` (collections are always returned intact).
		*/
		get(key, keepScalar) {
			return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
		}
		/**
		* Returns item at `path`, or `undefined` if not found. By default unwraps
		* scalar values from their surrounding node; to disable set `keepScalar` to
		* `true` (collections are always returned intact).
		*/
		getIn(path, keepScalar) {
			if (Collection.isEmptyPath(path)) return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
			return identity.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
		}
		/**
		* Checks if the document includes a value with the key `key`.
		*/
		has(key) {
			return identity.isCollection(this.contents) ? this.contents.has(key) : false;
		}
		/**
		* Checks if the document includes a value at `path`.
		*/
		hasIn(path) {
			if (Collection.isEmptyPath(path)) return this.contents !== void 0;
			return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
		}
		/**
		* Sets a value in this document. For `!!set`, `value` needs to be a
		* boolean to add/remove the item from the set.
		*/
		set(key, value) {
			if (this.contents == null) this.contents = Collection.collectionFromPath(this.schema, [key], value);
			else if (assertCollection(this.contents)) this.contents.set(key, value);
		}
		/**
		* Sets a value in this document. For `!!set`, `value` needs to be a
		* boolean to add/remove the item from the set.
		*/
		setIn(path, value) {
			if (Collection.isEmptyPath(path)) this.contents = value;
			else if (this.contents == null) this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
			else if (assertCollection(this.contents)) this.contents.setIn(path, value);
		}
		/**
		* Change the YAML version and schema used by the document.
		* A `null` version disables support for directives, explicit tags, anchors, and aliases.
		* It also requires the `schema` option to be given as a `Schema` instance value.
		*
		* Overrides all previously set schema options.
		*/
		setSchema(version, options = {}) {
			if (typeof version === "number") version = String(version);
			let opt;
			switch (version) {
				case "1.1":
					if (this.directives) this.directives.yaml.version = "1.1";
					else this.directives = new directives.Directives({ version: "1.1" });
					opt = {
						resolveKnownTags: false,
						schema: "yaml-1.1"
					};
					break;
				case "1.2":
				case "next":
					if (this.directives) this.directives.yaml.version = version;
					else this.directives = new directives.Directives({ version });
					opt = {
						resolveKnownTags: true,
						schema: "core"
					};
					break;
				case null:
					if (this.directives) delete this.directives;
					opt = null;
					break;
				default: {
					const sv = JSON.stringify(version);
					throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
				}
			}
			if (options.schema instanceof Object) this.schema = options.schema;
			else if (opt) this.schema = new Schema.Schema(Object.assign(opt, options));
			else throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
		}
		toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
			const ctx = {
				anchors: /* @__PURE__ */ new Map(),
				doc: this,
				keep: !json,
				mapAsMap: mapAsMap === true,
				mapKeyWarned: false,
				maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
			};
			const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
			if (typeof onAnchor === "function") for (const { count, res } of ctx.anchors.values()) onAnchor(res, count);
			return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
		}
		/**
		* A JSON representation of the document `contents`.
		*
		* @param jsonArg Used by `JSON.stringify` to indicate the array index or
		*   property name.
		*/
		toJSON(jsonArg, onAnchor) {
			return this.toJS({
				json: true,
				jsonArg,
				mapAsMap: false,
				onAnchor
			});
		}
		/** A YAML representation of the document. */
		toString(options = {}) {
			if (this.errors.length > 0) throw new Error("Document with errors cannot be stringified");
			if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
				const s = JSON.stringify(options.indent);
				throw new Error(`"indent" option must be a positive integer, not ${s}`);
			}
			return stringifyDocument.stringifyDocument(this, options);
		}
	};
	function assertCollection(contents) {
		if (identity.isCollection(contents)) return true;
		throw new Error("Expected a YAML collection as document contents");
	}
	exports.Document = Document;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/errors.js
var require_errors$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var YAMLError = class extends Error {
		constructor(name, pos, code, message) {
			super();
			this.name = name;
			this.code = code;
			this.message = message;
			this.pos = pos;
		}
	};
	var YAMLParseError = class extends YAMLError {
		constructor(pos, code, message) {
			super("YAMLParseError", pos, code, message);
		}
	};
	var YAMLWarning = class extends YAMLError {
		constructor(pos, code, message) {
			super("YAMLWarning", pos, code, message);
		}
	};
	var prettifyError = (src, lc) => (error) => {
		if (error.pos[0] === -1) return;
		error.linePos = error.pos.map((pos) => lc.linePos(pos));
		const { line, col } = error.linePos[0];
		error.message += ` at line ${line}, column ${col}`;
		let ci = col - 1;
		let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
		if (ci >= 60 && lineStr.length > 80) {
			const trimStart = Math.min(ci - 39, lineStr.length - 79);
			lineStr = "…" + lineStr.substring(trimStart);
			ci -= trimStart - 1;
		}
		if (lineStr.length > 80) lineStr = lineStr.substring(0, 79) + "…";
		if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
			let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
			if (prev.length > 80) prev = prev.substring(0, 79) + "…\n";
			lineStr = prev + lineStr;
		}
		if (/[^ ]/.test(lineStr)) {
			let count = 1;
			const end = error.linePos[1];
			if (end?.line === line && end.col > col) count = Math.max(1, Math.min(end.col - col, 80 - ci));
			const pointer = " ".repeat(ci) + "^".repeat(count);
			error.message += `:\n\n${lineStr}\n${pointer}\n`;
		}
	};
	exports.YAMLError = YAMLError;
	exports.YAMLParseError = YAMLParseError;
	exports.YAMLWarning = YAMLWarning;
	exports.prettifyError = prettifyError;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = /* @__PURE__ */ __commonJSMin(((exports) => {
	function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
		let spaceBefore = false;
		let atNewline = startOnNewline;
		let hasSpace = startOnNewline;
		let comment = "";
		let commentSep = "";
		let hasNewline = false;
		let reqSpace = false;
		let tab = null;
		let anchor = null;
		let tag = null;
		let newlineAfterProp = null;
		let comma = null;
		let found = null;
		let start = null;
		for (const token of tokens) {
			if (reqSpace) {
				if (token.type !== "space" && token.type !== "newline" && token.type !== "comma") onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
				reqSpace = false;
			}
			if (tab) {
				if (atNewline && token.type !== "comment" && token.type !== "newline") onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
				tab = null;
			}
			switch (token.type) {
				case "space":
					if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) tab = token;
					hasSpace = true;
					break;
				case "comment": {
					if (!hasSpace) onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
					const cb = token.source.substring(1) || " ";
					if (!comment) comment = cb;
					else comment += commentSep + cb;
					commentSep = "";
					atNewline = false;
					break;
				}
				case "newline":
					if (atNewline) {
						if (comment) comment += token.source;
						else if (!found || indicator !== "seq-item-ind") spaceBefore = true;
					} else commentSep += token.source;
					atNewline = true;
					hasNewline = true;
					if (anchor || tag) newlineAfterProp = token;
					hasSpace = true;
					break;
				case "anchor":
					if (anchor) onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
					if (token.source.endsWith(":")) onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
					anchor = token;
					start ?? (start = token.offset);
					atNewline = false;
					hasSpace = false;
					reqSpace = true;
					break;
				case "tag":
					if (tag) onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
					tag = token;
					start ?? (start = token.offset);
					atNewline = false;
					hasSpace = false;
					reqSpace = true;
					break;
				case indicator:
					if (anchor || tag) onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
					if (found) onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
					found = token;
					atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
					hasSpace = false;
					break;
				case "comma": if (flow) {
					if (comma) onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
					comma = token;
					atNewline = false;
					hasSpace = false;
					break;
				}
				default:
					onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
					atNewline = false;
					hasSpace = false;
			}
		}
		const last = tokens[tokens.length - 1];
		const end = last ? last.offset + last.source.length : offset;
		if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
		if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq")) onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
		return {
			comma,
			found,
			spaceBefore,
			comment,
			hasNewline,
			anchor,
			tag,
			newlineAfterProp,
			end,
			start: start ?? end
		};
	}
	exports.resolveProps = resolveProps;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = /* @__PURE__ */ __commonJSMin(((exports) => {
	function containsNewline(key) {
		if (!key) return null;
		switch (key.type) {
			case "alias":
			case "scalar":
			case "double-quoted-scalar":
			case "single-quoted-scalar":
				if (key.source.includes("\n")) return true;
				if (key.end) {
					for (const st of key.end) if (st.type === "newline") return true;
				}
				return false;
			case "flow-collection":
				for (const it of key.items) {
					for (const st of it.start) if (st.type === "newline") return true;
					if (it.sep) {
						for (const st of it.sep) if (st.type === "newline") return true;
					}
					if (containsNewline(it.key) || containsNewline(it.value)) return true;
				}
				return false;
			default: return true;
		}
	}
	exports.containsNewline = containsNewline;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = /* @__PURE__ */ __commonJSMin(((exports) => {
	var utilContainsNewline = require_util_contains_newline();
	function flowIndentCheck(indent, fc, onError) {
		if (fc?.type === "flow-collection") {
			const end = fc.end[0];
			if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) onError(end, "BAD_INDENT", "Flow end indicator should be more indented than parent", true);
		}
	}
	exports.flowIndentCheck = flowIndentCheck;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	function mapIncludes(ctx, items, search) {
		const { uniqueKeys } = ctx.options;
		if (uniqueKeys === false) return false;
		const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
		return items.some((pair) => isEqual(pair.key, search));
	}
	exports.mapIncludes = mapIncludes;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Pair = require_Pair();
	var YAMLMap = require_YAMLMap();
	var resolveProps = require_resolve_props();
	var utilContainsNewline = require_util_contains_newline();
	var utilFlowIndentCheck = require_util_flow_indent_check();
	var utilMapIncludes = require_util_map_includes();
	var startColMsg = "All mapping items must start at the same column";
	function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
		const map = new ((tag?.nodeClass) ?? YAMLMap.YAMLMap)(ctx.schema);
		if (ctx.atRoot) ctx.atRoot = false;
		let offset = bm.offset;
		let commentEnd = null;
		for (const collItem of bm.items) {
			const { start, key, sep, value } = collItem;
			const keyProps = resolveProps.resolveProps(start, {
				indicator: "explicit-key-ind",
				next: key ?? sep?.[0],
				offset,
				onError,
				parentIndent: bm.indent,
				startOnNewline: true
			});
			const implicitKey = !keyProps.found;
			if (implicitKey) {
				if (key) {
					if (key.type === "block-seq") onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
					else if ("indent" in key && key.indent !== bm.indent) onError(offset, "BAD_INDENT", startColMsg);
				}
				if (!keyProps.anchor && !keyProps.tag && !sep) {
					commentEnd = keyProps.end;
					if (keyProps.comment) {
						if (map.comment) map.comment += "\n" + keyProps.comment;
						else map.comment = keyProps.comment;
					}
					continue;
				}
				if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
			} else if (keyProps.found?.indent !== bm.indent) onError(offset, "BAD_INDENT", startColMsg);
			ctx.atKey = true;
			const keyStart = keyProps.end;
			const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
			if (ctx.schema.compat) utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
			ctx.atKey = false;
			if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode)) onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
			const valueProps = resolveProps.resolveProps(sep ?? [], {
				indicator: "map-value-ind",
				next: value,
				offset: keyNode.range[2],
				onError,
				parentIndent: bm.indent,
				startOnNewline: !key || key.type === "block-scalar"
			});
			offset = valueProps.end;
			if (valueProps.found) {
				if (implicitKey) {
					if (value?.type === "block-map" && !valueProps.hasNewline) onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
					if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024) onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
				}
				const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
				if (ctx.schema.compat) utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
				offset = valueNode.range[2];
				const pair = new Pair.Pair(keyNode, valueNode);
				if (ctx.options.keepSourceTokens) pair.srcToken = collItem;
				map.items.push(pair);
			} else {
				if (implicitKey) onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
				if (valueProps.comment) {
					if (keyNode.comment) keyNode.comment += "\n" + valueProps.comment;
					else keyNode.comment = valueProps.comment;
				}
				const pair = new Pair.Pair(keyNode);
				if (ctx.options.keepSourceTokens) pair.srcToken = collItem;
				map.items.push(pair);
			}
		}
		if (commentEnd && commentEnd < offset) onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
		map.range = [
			bm.offset,
			offset,
			commentEnd ?? offset
		];
		return map;
	}
	exports.resolveBlockMap = resolveBlockMap;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = /* @__PURE__ */ __commonJSMin(((exports) => {
	var YAMLSeq = require_YAMLSeq();
	var resolveProps = require_resolve_props();
	var utilFlowIndentCheck = require_util_flow_indent_check();
	function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
		const seq = new ((tag?.nodeClass) ?? YAMLSeq.YAMLSeq)(ctx.schema);
		if (ctx.atRoot) ctx.atRoot = false;
		if (ctx.atKey) ctx.atKey = false;
		let offset = bs.offset;
		let commentEnd = null;
		for (const { start, value } of bs.items) {
			const props = resolveProps.resolveProps(start, {
				indicator: "seq-item-ind",
				next: value,
				offset,
				onError,
				parentIndent: bs.indent,
				startOnNewline: true
			});
			if (!props.found) {
				if (props.anchor || props.tag || value) {
					if (value?.type === "block-seq") onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
					else onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
				} else {
					commentEnd = props.end;
					if (props.comment) seq.comment = props.comment;
					continue;
				}
			}
			const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
			if (ctx.schema.compat) utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
			offset = node.range[2];
			seq.items.push(node);
		}
		seq.range = [
			bs.offset,
			offset,
			commentEnd ?? offset
		];
		return seq;
	}
	exports.resolveBlockSeq = resolveBlockSeq;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = /* @__PURE__ */ __commonJSMin(((exports) => {
	function resolveEnd(end, offset, reqSpace, onError) {
		let comment = "";
		if (end) {
			let hasSpace = false;
			let sep = "";
			for (const token of end) {
				const { source, type } = token;
				switch (type) {
					case "space":
						hasSpace = true;
						break;
					case "comment": {
						if (reqSpace && !hasSpace) onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
						const cb = source.substring(1) || " ";
						if (!comment) comment = cb;
						else comment += sep + cb;
						sep = "";
						break;
					}
					case "newline":
						if (comment) sep += source;
						hasSpace = true;
						break;
					default: onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
				}
				offset += source.length;
			}
		}
		return {
			comment,
			offset
		};
	}
	exports.resolveEnd = resolveEnd;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var Pair = require_Pair();
	var YAMLMap = require_YAMLMap();
	var YAMLSeq = require_YAMLSeq();
	var resolveEnd = require_resolve_end();
	var resolveProps = require_resolve_props();
	var utilContainsNewline = require_util_contains_newline();
	var utilMapIncludes = require_util_map_includes();
	var blockMsg = "Block collections are not allowed within flow collections";
	var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
	function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
		const isMap = fc.start.source === "{";
		const fcName = isMap ? "flow map" : "flow sequence";
		const coll = new ((tag?.nodeClass) ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq))(ctx.schema);
		coll.flow = true;
		const atRoot = ctx.atRoot;
		if (atRoot) ctx.atRoot = false;
		if (ctx.atKey) ctx.atKey = false;
		let offset = fc.offset + fc.start.source.length;
		for (let i = 0; i < fc.items.length; ++i) {
			const collItem = fc.items[i];
			const { start, key, sep, value } = collItem;
			const props = resolveProps.resolveProps(start, {
				flow: fcName,
				indicator: "explicit-key-ind",
				next: key ?? sep?.[0],
				offset,
				onError,
				parentIndent: fc.indent,
				startOnNewline: false
			});
			if (!props.found) {
				if (!props.anchor && !props.tag && !sep && !value) {
					if (i === 0 && props.comma) onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
					else if (i < fc.items.length - 1) onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
					if (props.comment) {
						if (coll.comment) coll.comment += "\n" + props.comment;
						else coll.comment = props.comment;
					}
					offset = props.end;
					continue;
				}
				if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key)) onError(key, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
			}
			if (i === 0) {
				if (props.comma) onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
			} else {
				if (!props.comma) onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
				if (props.comment) {
					let prevItemComment = "";
					loop: for (const st of start) switch (st.type) {
						case "comma":
						case "space": break;
						case "comment":
							prevItemComment = st.source.substring(1);
							break loop;
						default: break loop;
					}
					if (prevItemComment) {
						let prev = coll.items[coll.items.length - 1];
						if (identity.isPair(prev)) prev = prev.value ?? prev.key;
						if (prev.comment) prev.comment += "\n" + prevItemComment;
						else prev.comment = prevItemComment;
						props.comment = props.comment.substring(prevItemComment.length + 1);
					}
				}
			}
			if (!isMap && !sep && !props.found) {
				const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
				coll.items.push(valueNode);
				offset = valueNode.range[2];
				if (isBlock(value)) onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
			} else {
				ctx.atKey = true;
				const keyStart = props.end;
				const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
				if (isBlock(key)) onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
				ctx.atKey = false;
				const valueProps = resolveProps.resolveProps(sep ?? [], {
					flow: fcName,
					indicator: "map-value-ind",
					next: value,
					offset: keyNode.range[2],
					onError,
					parentIndent: fc.indent,
					startOnNewline: false
				});
				if (valueProps.found) {
					if (!isMap && !props.found && ctx.options.strict) {
						if (sep) for (const st of sep) {
							if (st === valueProps.found) break;
							if (st.type === "newline") {
								onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
								break;
							}
						}
						if (props.start < valueProps.found.offset - 1024) onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
					}
				} else if (value) {
					if ("source" in value && value.source?.[0] === ":") onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
					else onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
				}
				const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
				if (valueNode) {
					if (isBlock(value)) onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
				} else if (valueProps.comment) {
					if (keyNode.comment) keyNode.comment += "\n" + valueProps.comment;
					else keyNode.comment = valueProps.comment;
				}
				const pair = new Pair.Pair(keyNode, valueNode);
				if (ctx.options.keepSourceTokens) pair.srcToken = collItem;
				if (isMap) {
					const map = coll;
					if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode)) onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
					map.items.push(pair);
				} else {
					const map = new YAMLMap.YAMLMap(ctx.schema);
					map.flow = true;
					map.items.push(pair);
					const endRange = (valueNode ?? keyNode).range;
					map.range = [
						keyNode.range[0],
						endRange[1],
						endRange[2]
					];
					coll.items.push(map);
				}
				offset = valueNode ? valueNode.range[2] : valueProps.end;
			}
		}
		const expectedEnd = isMap ? "}" : "]";
		const [ce, ...ee] = fc.end;
		let cePos = offset;
		if (ce?.source === expectedEnd) cePos = ce.offset + ce.source.length;
		else {
			const name = fcName[0].toUpperCase() + fcName.substring(1);
			const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
			onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
			if (ce && ce.source.length !== 1) ee.unshift(ce);
		}
		if (ee.length > 0) {
			const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
			if (end.comment) {
				if (coll.comment) coll.comment += "\n" + end.comment;
				else coll.comment = end.comment;
			}
			coll.range = [
				fc.offset,
				cePos,
				end.offset
			];
		} else coll.range = [
			fc.offset,
			cePos,
			cePos
		];
		return coll;
	}
	exports.resolveFlowCollection = resolveFlowCollection;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var Scalar = require_Scalar();
	var YAMLMap = require_YAMLMap();
	var YAMLSeq = require_YAMLSeq();
	var resolveBlockMap = require_resolve_block_map();
	var resolveBlockSeq = require_resolve_block_seq();
	var resolveFlowCollection = require_resolve_flow_collection();
	function resolveCollection(CN, ctx, token, onError, tagName, tag) {
		const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
		const Coll = coll.constructor;
		if (tagName === "!" || tagName === Coll.tagName) {
			coll.tag = Coll.tagName;
			return coll;
		}
		if (tagName) coll.tag = tagName;
		return coll;
	}
	function composeCollection(CN, ctx, token, props, onError) {
		const tagToken = props.tag;
		const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
		if (token.type === "block-seq") {
			const { anchor, newlineAfterProp: nl } = props;
			const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
			if (lastProp && (!nl || nl.offset < lastProp.offset)) onError(lastProp, "MISSING_CHAR", "Missing newline after block sequence props");
		}
		const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
		if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") return resolveCollection(CN, ctx, token, onError, tagName);
		let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
		if (!tag) {
			const kt = ctx.schema.knownTags[tagName];
			if (kt?.collection === expType) {
				ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
				tag = kt;
			} else {
				if (kt) onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
				else onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
				return resolveCollection(CN, ctx, token, onError, tagName);
			}
		}
		const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
		const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
		const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
		node.range = coll.range;
		node.tag = tagName;
		if (tag?.format) node.format = tag.format;
		return node;
	}
	exports.composeCollection = composeCollection;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Scalar = require_Scalar();
	function resolveBlockScalar(ctx, scalar, onError) {
		const start = scalar.offset;
		const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
		if (!header) return {
			value: "",
			type: null,
			comment: "",
			range: [
				start,
				start,
				start
			]
		};
		const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
		const lines = scalar.source ? splitLines(scalar.source) : [];
		let chompStart = lines.length;
		for (let i = lines.length - 1; i >= 0; --i) {
			const content = lines[i][1];
			if (content === "" || content === "\r") chompStart = i;
			else break;
		}
		if (chompStart === 0) {
			const value = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
			let end = start + header.length;
			if (scalar.source) end += scalar.source.length;
			return {
				value,
				type,
				comment: header.comment,
				range: [
					start,
					end,
					end
				]
			};
		}
		let trimIndent = scalar.indent + header.indent;
		let offset = scalar.offset + header.length;
		let contentStart = 0;
		for (let i = 0; i < chompStart; ++i) {
			const [indent, content] = lines[i];
			if (content === "" || content === "\r") {
				if (header.indent === 0 && indent.length > trimIndent) trimIndent = indent.length;
			} else {
				if (indent.length < trimIndent) onError(offset + indent.length, "MISSING_CHAR", "Block scalars with more-indented leading empty lines must use an explicit indentation indicator");
				if (header.indent === 0) trimIndent = indent.length;
				contentStart = i;
				if (trimIndent === 0 && !ctx.atRoot) onError(offset, "BAD_INDENT", "Block scalar values in collections must be indented");
				break;
			}
			offset += indent.length + content.length + 1;
		}
		for (let i = lines.length - 1; i >= chompStart; --i) if (lines[i][0].length > trimIndent) chompStart = i + 1;
		let value = "";
		let sep = "";
		let prevMoreIndented = false;
		for (let i = 0; i < contentStart; ++i) value += lines[i][0].slice(trimIndent) + "\n";
		for (let i = contentStart; i < chompStart; ++i) {
			let [indent, content] = lines[i];
			offset += indent.length + content.length + 1;
			const crlf = content[content.length - 1] === "\r";
			if (crlf) content = content.slice(0, -1);
			/* istanbul ignore if already caught in lexer */
			if (content && indent.length < trimIndent) {
				const message = `Block scalar lines must not be less indented than their ${header.indent ? "explicit indentation indicator" : "first line"}`;
				onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
				indent = "";
			}
			if (type === Scalar.Scalar.BLOCK_LITERAL) {
				value += sep + indent.slice(trimIndent) + content;
				sep = "\n";
			} else if (indent.length > trimIndent || content[0] === "	") {
				if (sep === " ") sep = "\n";
				else if (!prevMoreIndented && sep === "\n") sep = "\n\n";
				value += sep + indent.slice(trimIndent) + content;
				sep = "\n";
				prevMoreIndented = true;
			} else if (content === "") {
				if (sep === "\n") value += "\n";
				else sep = "\n";
			} else {
				value += sep + content;
				sep = " ";
				prevMoreIndented = false;
			}
		}
		switch (header.chomp) {
			case "-": break;
			case "+":
				for (let i = chompStart; i < lines.length; ++i) value += "\n" + lines[i][0].slice(trimIndent);
				if (value[value.length - 1] !== "\n") value += "\n";
				break;
			default: value += "\n";
		}
		const end = start + header.length + scalar.source.length;
		return {
			value,
			type,
			comment: header.comment,
			range: [
				start,
				end,
				end
			]
		};
	}
	function parseBlockScalarHeader({ offset, props }, strict, onError) {
		/* istanbul ignore if should not happen */
		if (props[0].type !== "block-scalar-header") {
			onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
			return null;
		}
		const { source } = props[0];
		const mode = source[0];
		let indent = 0;
		let chomp = "";
		let error = -1;
		for (let i = 1; i < source.length; ++i) {
			const ch = source[i];
			if (!chomp && (ch === "-" || ch === "+")) chomp = ch;
			else {
				const n = Number(ch);
				if (!indent && n) indent = n;
				else if (error === -1) error = offset + i;
			}
		}
		if (error !== -1) onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
		let hasSpace = false;
		let comment = "";
		let length = source.length;
		for (let i = 1; i < props.length; ++i) {
			const token = props[i];
			switch (token.type) {
				case "space": hasSpace = true;
				case "newline":
					length += token.source.length;
					break;
				case "comment":
					if (strict && !hasSpace) onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
					length += token.source.length;
					comment = token.source.substring(1);
					break;
				case "error":
					onError(token, "UNEXPECTED_TOKEN", token.message);
					length += token.source.length;
					break;
				/* istanbul ignore next should not happen */
				default: {
					onError(token, "UNEXPECTED_TOKEN", `Unexpected token in block scalar header: ${token.type}`);
					const ts = token.source;
					if (ts && typeof ts === "string") length += ts.length;
				}
			}
		}
		return {
			mode,
			indent,
			chomp,
			comment,
			length
		};
	}
	/** @returns Array of lines split up as `[indent, content]` */
	function splitLines(source) {
		const split = source.split(/\n( *)/);
		const first = split[0];
		const m = first.match(/^( *)/);
		const lines = [m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first]];
		for (let i = 1; i < split.length; i += 2) lines.push([split[i], split[i + 1]]);
		return lines;
	}
	exports.resolveBlockScalar = resolveBlockScalar;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Scalar = require_Scalar();
	var resolveEnd = require_resolve_end();
	function resolveFlowScalar(scalar, strict, onError) {
		const { offset, type, source, end } = scalar;
		let _type;
		let value;
		const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
		switch (type) {
			case "scalar":
				_type = Scalar.Scalar.PLAIN;
				value = plainValue(source, _onError);
				break;
			case "single-quoted-scalar":
				_type = Scalar.Scalar.QUOTE_SINGLE;
				value = singleQuotedValue(source, _onError);
				break;
			case "double-quoted-scalar":
				_type = Scalar.Scalar.QUOTE_DOUBLE;
				value = doubleQuotedValue(source, _onError);
				break;
			/* istanbul ignore next should not happen */
			default:
				onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
				return {
					value: "",
					type: null,
					comment: "",
					range: [
						offset,
						offset + source.length,
						offset + source.length
					]
				};
		}
		const valueEnd = offset + source.length;
		const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
		return {
			value,
			type: _type,
			comment: re.comment,
			range: [
				offset,
				valueEnd,
				re.offset
			]
		};
	}
	function plainValue(source, onError) {
		let badChar = "";
		switch (source[0]) {
			/* istanbul ignore next should not happen */
			case "	":
				badChar = "a tab character";
				break;
			case ",":
				badChar = "flow indicator character ,";
				break;
			case "%":
				badChar = "directive indicator character %";
				break;
			case "|":
			case ">":
				badChar = `block scalar indicator ${source[0]}`;
				break;
			case "@":
			case "`": badChar = `reserved character ${source[0]}`;
		}
		if (badChar) onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
		return unfoldLines(source);
	}
	function singleQuotedValue(source, onError) {
		if (source[source.length - 1] !== "'" || source.length === 1) onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
		return unfoldLines(source.slice(1, -1)).replace(/''/g, "'");
	}
	function unfoldLines(source) {
		const line = /(.*?)\r?\n/sy;
		let match = line.exec(source);
		if (!match) return source;
		/**
		* The negative lookbehinds in these RegExps are to
		* prevent causing a polynomial search time in certain cases.
		*
		* The try-catch is for Safari < 16.4 and other old browsers:
		* https://caniuse.com/js-regexp-lookbehind
		*/
		let trimEnd, trimBoth;
		try {
			trimEnd = /* @__PURE__ */ new RegExp("(?<![ 	])[ 	]+$");
			trimBoth = /* @__PURE__ */ new RegExp("^[ 	]+|(?<![ 	])[ 	]+$", "g");
		} catch {
			trimEnd = /[ \t]+$/;
			trimBoth = /^[ \t]+|[ \t]+$/g;
		}
		let res = match[1].replace(trimEnd, "");
		let sep = " ";
		let pos = line.lastIndex;
		while (match = line.exec(source)) {
			const lm = match[1].replace(trimBoth, "");
			if (lm === "") {
				if (sep === "\n") res += sep;
				else sep = "\n";
			} else {
				res += sep + lm;
				sep = " ";
			}
			pos = line.lastIndex;
		}
		const last = /[ \t]*(.*)/sy;
		last.lastIndex = pos;
		match = last.exec(source);
		return res + sep + (match?.[1] ?? "");
	}
	function doubleQuotedValue(source, onError) {
		let res = "";
		for (let i = 1; i < source.length - 1; ++i) {
			const ch = source[i];
			if (ch === "\r" && source[i + 1] === "\n") continue;
			if (ch === "\n") {
				const { fold, offset } = foldNewline(source, i);
				res += fold;
				i = offset;
			} else if (ch === "\\") {
				let next = source[++i];
				const cc = escapeCodes[next];
				if (cc) res += cc;
				else if (next === "\n") {
					next = source[i + 1];
					while (next === " " || next === "	") next = source[++i + 1];
				} else if (next === "\r" && source[i + 1] === "\n") {
					next = source[++i + 1];
					while (next === " " || next === "	") next = source[++i + 1];
				} else if (next === "x" || next === "u" || next === "U") {
					const length = next === "x" ? 2 : next === "u" ? 4 : 8;
					res += parseCharCode(source, i + 1, length, onError);
					i += length;
				} else {
					const raw = source.substr(i - 1, 2);
					onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
					res += raw;
				}
			} else if (ch === " " || ch === "	") {
				const wsStart = i;
				let next = source[i + 1];
				while (next === " " || next === "	") next = source[++i + 1];
				if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n")) res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
			} else res += ch;
		}
		if (source[source.length - 1] !== "\"" || source.length === 1) onError(source.length, "MISSING_CHAR", "Missing closing \"quote");
		return res;
	}
	/**
	* Fold a single newline into a space, multiple newlines to N - 1 newlines.
	* Presumes `source[offset] === '\n'`
	*/
	function foldNewline(source, offset) {
		let fold = "";
		let ch = source[offset + 1];
		while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
			if (ch === "\r" && source[offset + 2] !== "\n") break;
			if (ch === "\n") fold += "\n";
			offset += 1;
			ch = source[offset + 1];
		}
		if (!fold) fold = " ";
		return {
			fold,
			offset
		};
	}
	var escapeCodes = {
		"0": "\0",
		a: "\x07",
		b: "\b",
		e: "\x1B",
		f: "\f",
		n: "\n",
		r: "\r",
		t: "	",
		v: "\v",
		N: "",
		_: "\xA0",
		L: "\u2028",
		P: "\u2029",
		" ": " ",
		"\"": "\"",
		"/": "/",
		"\\": "\\",
		"	": "	"
	};
	function parseCharCode(source, offset, length, onError) {
		const cc = source.substr(offset, length);
		const code = cc.length === length && /^[0-9a-fA-F]+$/.test(cc) ? parseInt(cc, 16) : NaN;
		try {
			return String.fromCodePoint(code);
		} catch {
			const raw = source.substr(offset - 2, length + 2);
			onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
			return raw;
		}
	}
	exports.resolveFlowScalar = resolveFlowScalar;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = /* @__PURE__ */ __commonJSMin(((exports) => {
	var identity = require_identity();
	var Scalar = require_Scalar();
	var resolveBlockScalar = require_resolve_block_scalar();
	var resolveFlowScalar = require_resolve_flow_scalar();
	function composeScalar(ctx, token, tagToken, onError) {
		const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
		const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
		let tag;
		if (ctx.options.stringKeys && ctx.atKey) tag = ctx.schema[identity.SCALAR];
		else if (tagName) tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
		else if (token.type === "scalar") tag = findScalarTagByTest(ctx, value, token, onError);
		else tag = ctx.schema[identity.SCALAR];
		let scalar;
		try {
			const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
			scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
			scalar = new Scalar.Scalar(value);
		}
		scalar.range = range;
		scalar.source = value;
		if (type) scalar.type = type;
		if (tagName) scalar.tag = tagName;
		if (tag.format) scalar.format = tag.format;
		if (comment) scalar.comment = comment;
		return scalar;
	}
	function findScalarTagByName(schema, value, tagName, tagToken, onError) {
		if (tagName === "!") return schema[identity.SCALAR];
		const matchWithTest = [];
		for (const tag of schema.tags) if (!tag.collection && tag.tag === tagName) {
			if (tag.default && tag.test) matchWithTest.push(tag);
			else return tag;
		}
		for (const tag of matchWithTest) if (tag.test?.test(value)) return tag;
		const kt = schema.knownTags[tagName];
		if (kt && !kt.collection) {
			schema.tags.push(Object.assign({}, kt, {
				default: false,
				test: void 0
			}));
			return kt;
		}
		onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
		return schema[identity.SCALAR];
	}
	function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
		const tag = schema.tags.find((tag) => (tag.default === true || atKey && tag.default === "key") && tag.test?.test(value)) || schema[identity.SCALAR];
		if (schema.compat) {
			const compat = schema.compat.find((tag) => tag.default && tag.test?.test(value)) ?? schema[identity.SCALAR];
			if (tag.tag !== compat.tag) onError(token, "TAG_RESOLVE_FAILED", `Value may be parsed as either ${directives.tagString(tag.tag)} or ${directives.tagString(compat.tag)}`, true);
		}
		return tag;
	}
	exports.composeScalar = composeScalar;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = /* @__PURE__ */ __commonJSMin(((exports) => {
	function emptyScalarPosition(offset, before, pos) {
		if (before) {
			pos ?? (pos = before.length);
			for (let i = pos - 1; i >= 0; --i) {
				let st = before[i];
				switch (st.type) {
					case "space":
					case "comment":
					case "newline":
						offset -= st.source.length;
						continue;
				}
				st = before[++i];
				while (st?.type === "space") {
					offset += st.source.length;
					st = before[++i];
				}
				break;
			}
		}
		return offset;
	}
	exports.emptyScalarPosition = emptyScalarPosition;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Alias = require_Alias();
	var identity = require_identity();
	var composeCollection = require_compose_collection();
	var composeScalar = require_compose_scalar();
	var resolveEnd = require_resolve_end();
	var utilEmptyScalarPosition = require_util_empty_scalar_position();
	var CN = {
		composeNode,
		composeEmptyNode
	};
	function composeNode(ctx, token, props, onError) {
		const atKey = ctx.atKey;
		const { spaceBefore, comment, anchor, tag } = props;
		let node;
		let isSrcToken = true;
		switch (token.type) {
			case "alias":
				node = composeAlias(ctx, token, onError);
				if (anchor || tag) onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
				break;
			case "scalar":
			case "single-quoted-scalar":
			case "double-quoted-scalar":
			case "block-scalar":
				node = composeScalar.composeScalar(ctx, token, tag, onError);
				if (anchor) node.anchor = anchor.source.substring(1);
				break;
			case "block-map":
			case "block-seq":
			case "flow-collection":
				try {
					node = composeCollection.composeCollection(CN, ctx, token, props, onError);
					if (anchor) node.anchor = anchor.source.substring(1);
				} catch (error) {
					onError(token, "RESOURCE_EXHAUSTION", error instanceof Error ? error.message : String(error));
				}
				break;
			default:
				onError(token, "UNEXPECTED_TOKEN", token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`);
				isSrcToken = false;
		}
		node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
		if (anchor && node.anchor === "") onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
		if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) onError(tag ?? token, "NON_STRING_KEY", "With stringKeys, all keys must be strings");
		if (spaceBefore) node.spaceBefore = true;
		if (comment) {
			if (token.type === "scalar" && token.source === "") node.comment = comment;
			else node.commentBefore = comment;
		}
		if (ctx.options.keepSourceTokens && isSrcToken) node.srcToken = token;
		return node;
	}
	function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
		const token = {
			type: "scalar",
			offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
			indent: -1,
			source: ""
		};
		const node = composeScalar.composeScalar(ctx, token, tag, onError);
		if (anchor) {
			node.anchor = anchor.source.substring(1);
			if (node.anchor === "") onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
		}
		if (spaceBefore) node.spaceBefore = true;
		if (comment) {
			node.comment = comment;
			node.range[2] = end;
		}
		return node;
	}
	function composeAlias({ options }, { offset, source, end }, onError) {
		const alias = new Alias.Alias(source.substring(1));
		if (alias.source === "") onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
		if (alias.source.endsWith(":")) onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
		const valueEnd = offset + source.length;
		const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
		alias.range = [
			offset,
			valueEnd,
			re.offset
		];
		if (re.comment) alias.comment = re.comment;
		return alias;
	}
	exports.composeEmptyNode = composeEmptyNode;
	exports.composeNode = composeNode;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = /* @__PURE__ */ __commonJSMin(((exports) => {
	var Document = require_Document();
	var composeNode = require_compose_node();
	var resolveEnd = require_resolve_end();
	var resolveProps = require_resolve_props();
	function composeDoc(options, directives, { offset, start, value, end }, onError) {
		const opts = Object.assign({ _directives: directives }, options);
		const doc = new Document.Document(void 0, opts);
		const ctx = {
			atKey: false,
			atRoot: true,
			directives: doc.directives,
			options: doc.options,
			schema: doc.schema
		};
		const props = resolveProps.resolveProps(start, {
			indicator: "doc-start",
			next: value ?? end?.[0],
			offset,
			onError,
			parentIndent: 0,
			startOnNewline: true
		});
		if (props.found) {
			doc.directives.docStart = true;
			if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline) onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
		}
		doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
		const contentEnd = doc.contents.range[2];
		const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
		if (re.comment) doc.comment = re.comment;
		doc.range = [
			offset,
			contentEnd,
			re.offset
		];
		return doc;
	}
	exports.composeDoc = composeDoc;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/composer.js
var require_composer = /* @__PURE__ */ __commonJSMin(((exports) => {
	var node_process = __require("process");
	var directives = require_directives();
	var Document = require_Document();
	var errors = require_errors$1();
	var identity = require_identity();
	var composeDoc = require_compose_doc();
	var resolveEnd = require_resolve_end();
	function getErrorPos(src) {
		if (typeof src === "number") return [src, src + 1];
		if (Array.isArray(src)) return src.length === 2 ? src : [src[0], src[1]];
		const { offset, source } = src;
		return [offset, offset + (typeof source === "string" ? source.length : 1)];
	}
	function parsePrelude(prelude) {
		let comment = "";
		let atComment = false;
		let afterEmptyLine = false;
		for (let i = 0; i < prelude.length; ++i) {
			const source = prelude[i];
			switch (source[0]) {
				case "#":
					comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
					atComment = true;
					afterEmptyLine = false;
					break;
				case "%":
					if (prelude[i + 1]?.[0] !== "#") i += 1;
					atComment = false;
					break;
				default:
					if (!atComment) afterEmptyLine = true;
					atComment = false;
			}
		}
		return {
			comment,
			afterEmptyLine
		};
	}
	/**
	* Compose a stream of CST nodes into a stream of YAML Documents.
	*
	* ```ts
	* import { Composer, Parser } from 'yaml'
	*
	* const src: string = ...
	* const tokens = new Parser().parse(src)
	* const docs = new Composer().compose(tokens)
	* ```
	*/
	var Composer = class {
		constructor(options = {}) {
			this.doc = null;
			this.atDirectives = false;
			this.prelude = [];
			this.errors = [];
			this.warnings = [];
			this.onError = (source, code, message, warning) => {
				const pos = getErrorPos(source);
				if (warning) this.warnings.push(new errors.YAMLWarning(pos, code, message));
				else this.errors.push(new errors.YAMLParseError(pos, code, message));
			};
			this.directives = new directives.Directives({ version: options.version || "1.2" });
			this.options = options;
		}
		decorate(doc, afterDoc) {
			const { comment, afterEmptyLine } = parsePrelude(this.prelude);
			if (comment) {
				const dc = doc.contents;
				if (afterDoc) doc.comment = doc.comment ? `${doc.comment}\n${comment}` : comment;
				else if (afterEmptyLine || doc.directives.docStart || !dc) doc.commentBefore = comment;
				else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
					let it = dc.items[0];
					if (identity.isPair(it)) it = it.key;
					const cb = it.commentBefore;
					it.commentBefore = cb ? `${comment}\n${cb}` : comment;
				} else {
					const cb = dc.commentBefore;
					dc.commentBefore = cb ? `${comment}\n${cb}` : comment;
				}
			}
			if (afterDoc) {
				for (let i = 0; i < this.errors.length; ++i) doc.errors.push(this.errors[i]);
				for (let i = 0; i < this.warnings.length; ++i) doc.warnings.push(this.warnings[i]);
			} else {
				doc.errors = this.errors;
				doc.warnings = this.warnings;
			}
			this.prelude = [];
			this.errors = [];
			this.warnings = [];
		}
		/**
		* Current stream status information.
		*
		* Mostly useful at the end of input for an empty stream.
		*/
		streamInfo() {
			return {
				comment: parsePrelude(this.prelude).comment,
				directives: this.directives,
				errors: this.errors,
				warnings: this.warnings
			};
		}
		/**
		* Compose tokens into documents.
		*
		* @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
		* @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
		*/
		*compose(tokens, forceDoc = false, endOffset = -1) {
			for (const token of tokens) yield* this.next(token);
			yield* this.end(forceDoc, endOffset);
		}
		/** Advance the composer by one CST token. */
		*next(token) {
			if (node_process.env.LOG_STREAM) console.dir(token, { depth: null });
			switch (token.type) {
				case "directive":
					this.directives.add(token.source, (offset, message, warning) => {
						const pos = getErrorPos(token);
						pos[0] += offset;
						this.onError(pos, "BAD_DIRECTIVE", message, warning);
					});
					this.prelude.push(token.source);
					this.atDirectives = true;
					break;
				case "document": {
					const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
					if (this.atDirectives && !doc.directives.docStart) this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
					this.decorate(doc, false);
					if (this.doc) yield this.doc;
					this.doc = doc;
					this.atDirectives = false;
					break;
				}
				case "byte-order-mark":
				case "space": break;
				case "comment":
				case "newline":
					this.prelude.push(token.source);
					break;
				case "error": {
					const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
					const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
					if (this.atDirectives || !this.doc) this.errors.push(error);
					else this.doc.errors.push(error);
					break;
				}
				case "doc-end": {
					if (!this.doc) {
						this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", "Unexpected doc-end without preceding document"));
						break;
					}
					this.doc.directives.docEnd = true;
					const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
					this.decorate(this.doc, true);
					if (end.comment) {
						const dc = this.doc.comment;
						this.doc.comment = dc ? `${dc}\n${end.comment}` : end.comment;
					}
					this.doc.range[2] = end.offset;
					break;
				}
				default: this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
			}
		}
		/**
		* Call at end of input to yield any remaining document.
		*
		* @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
		* @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
		*/
		*end(forceDoc = false, endOffset = -1) {
			if (this.doc) {
				this.decorate(this.doc, true);
				yield this.doc;
				this.doc = null;
			} else if (forceDoc) {
				const opts = Object.assign({ _directives: this.directives }, this.options);
				const doc = new Document.Document(void 0, opts);
				if (this.atDirectives) this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
				doc.range = [
					0,
					endOffset,
					endOffset
				];
				this.decorate(doc, false);
				yield doc;
			}
		}
	};
	exports.Composer = Composer;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = /* @__PURE__ */ __commonJSMin(((exports) => {
	var resolveBlockScalar = require_resolve_block_scalar();
	var resolveFlowScalar = require_resolve_flow_scalar();
	var errors = require_errors$1();
	var stringifyString = require_stringifyString();
	function resolveAsScalar(token, strict = true, onError) {
		if (token) {
			const _onError = (pos, code, message) => {
				const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
				if (onError) onError(offset, code, message);
				else throw new errors.YAMLParseError([offset, offset + 1], code, message);
			};
			switch (token.type) {
				case "scalar":
				case "single-quoted-scalar":
				case "double-quoted-scalar": return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
				case "block-scalar": return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
			}
		}
		return null;
	}
	/**
	* Create a new scalar token with `value`
	*
	* Values that represent an actual string but may be parsed as a different type should use a `type` other than `'PLAIN'`,
	* as this function does not support any schema operations and won't check for such conflicts.
	*
	* @param value The string representation of the value, which will have its content properly indented.
	* @param context.end Comments and whitespace after the end of the value, or after the block scalar header. If undefined, a newline will be added.
	* @param context.implicitKey Being within an implicit key may affect the resolved type of the token's value.
	* @param context.indent The indent level of the token.
	* @param context.inFlow Is this scalar within a flow collection? This may affect the resolved type of the token's value.
	* @param context.offset The offset position of the token.
	* @param context.type The preferred type of the scalar token. If undefined, the previous type of the `token` will be used, defaulting to `'PLAIN'`.
	*/
	function createScalarToken(value, context) {
		const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
		const source = stringifyString.stringifyString({
			type,
			value
		}, {
			implicitKey,
			indent: indent > 0 ? " ".repeat(indent) : "",
			inFlow,
			options: {
				blockQuote: true,
				lineWidth: -1
			}
		});
		const end = context.end ?? [{
			type: "newline",
			offset: -1,
			indent,
			source: "\n"
		}];
		switch (source[0]) {
			case "|":
			case ">": {
				const he = source.indexOf("\n");
				const head = source.substring(0, he);
				const body = source.substring(he + 1) + "\n";
				const props = [{
					type: "block-scalar-header",
					offset,
					indent,
					source: head
				}];
				if (!addEndtoBlockProps(props, end)) props.push({
					type: "newline",
					offset: -1,
					indent,
					source: "\n"
				});
				return {
					type: "block-scalar",
					offset,
					indent,
					props,
					source: body
				};
			}
			case "\"": return {
				type: "double-quoted-scalar",
				offset,
				indent,
				source,
				end
			};
			case "'": return {
				type: "single-quoted-scalar",
				offset,
				indent,
				source,
				end
			};
			default: return {
				type: "scalar",
				offset,
				indent,
				source,
				end
			};
		}
	}
	/**
	* Set the value of `token` to the given string `value`, overwriting any previous contents and type that it may have.
	*
	* Best efforts are made to retain any comments previously associated with the `token`,
	* though all contents within a collection's `items` will be overwritten.
	*
	* Values that represent an actual string but may be parsed as a different type should use a `type` other than `'PLAIN'`,
	* as this function does not support any schema operations and won't check for such conflicts.
	*
	* @param token Any token. If it does not include an `indent` value, the value will be stringified as if it were an implicit key.
	* @param value The string representation of the value, which will have its content properly indented.
	* @param context.afterKey In most cases, values after a key should have an additional level of indentation.
	* @param context.implicitKey Being within an implicit key may affect the resolved type of the token's value.
	* @param context.inFlow Being within a flow collection may affect the resolved type of the token's value.
	* @param context.type The preferred type of the scalar token. If undefined, the previous type of the `token` will be used, defaulting to `'PLAIN'`.
	*/
	function setScalarValue(token, value, context = {}) {
		let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
		let indent = "indent" in token ? token.indent : null;
		if (afterKey && typeof indent === "number") indent += 2;
		if (!type) switch (token.type) {
			case "single-quoted-scalar":
				type = "QUOTE_SINGLE";
				break;
			case "double-quoted-scalar":
				type = "QUOTE_DOUBLE";
				break;
			case "block-scalar": {
				const header = token.props[0];
				if (header.type !== "block-scalar-header") throw new Error("Invalid block scalar header");
				type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
				break;
			}
			default: type = "PLAIN";
		}
		const source = stringifyString.stringifyString({
			type,
			value
		}, {
			implicitKey: implicitKey || indent === null,
			indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
			inFlow,
			options: {
				blockQuote: true,
				lineWidth: -1
			}
		});
		switch (source[0]) {
			case "|":
			case ">":
				setBlockScalarValue(token, source);
				break;
			case "\"":
				setFlowScalarValue(token, source, "double-quoted-scalar");
				break;
			case "'":
				setFlowScalarValue(token, source, "single-quoted-scalar");
				break;
			default: setFlowScalarValue(token, source, "scalar");
		}
	}
	function setBlockScalarValue(token, source) {
		const he = source.indexOf("\n");
		const head = source.substring(0, he);
		const body = source.substring(he + 1) + "\n";
		if (token.type === "block-scalar") {
			const header = token.props[0];
			if (header.type !== "block-scalar-header") throw new Error("Invalid block scalar header");
			header.source = head;
			token.source = body;
		} else {
			const { offset } = token;
			const indent = "indent" in token ? token.indent : -1;
			const props = [{
				type: "block-scalar-header",
				offset,
				indent,
				source: head
			}];
			if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0)) props.push({
				type: "newline",
				offset: -1,
				indent,
				source: "\n"
			});
			for (const key of Object.keys(token)) if (key !== "type" && key !== "offset") delete token[key];
			Object.assign(token, {
				type: "block-scalar",
				indent,
				props,
				source: body
			});
		}
	}
	/** @returns `true` if last token is a newline */
	function addEndtoBlockProps(props, end) {
		if (end) for (const st of end) switch (st.type) {
			case "space":
			case "comment":
				props.push(st);
				break;
			case "newline":
				props.push(st);
				return true;
		}
		return false;
	}
	function setFlowScalarValue(token, source, type) {
		switch (token.type) {
			case "scalar":
			case "double-quoted-scalar":
			case "single-quoted-scalar":
				token.type = type;
				token.source = source;
				break;
			case "block-scalar": {
				const end = token.props.slice(1);
				let oa = source.length;
				if (token.props[0].type === "block-scalar-header") oa -= token.props[0].source.length;
				for (const tok of end) tok.offset += oa;
				delete token.props;
				Object.assign(token, {
					type,
					source,
					end
				});
				break;
			}
			case "block-map":
			case "block-seq": {
				const nl = {
					type: "newline",
					offset: token.offset + source.length,
					indent: token.indent,
					source: "\n"
				};
				delete token.items;
				Object.assign(token, {
					type,
					source,
					end: [nl]
				});
				break;
			}
			default: {
				const indent = "indent" in token ? token.indent : -1;
				const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
				for (const key of Object.keys(token)) if (key !== "type" && key !== "offset") delete token[key];
				Object.assign(token, {
					type,
					indent,
					source,
					end
				});
			}
		}
	}
	exports.createScalarToken = createScalarToken;
	exports.resolveAsScalar = resolveAsScalar;
	exports.setScalarValue = setScalarValue;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = /* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* Stringify a CST document, token, or collection item
	*
	* Fair warning: This applies no validation whatsoever, and
	* simply concatenates the sources in their logical order.
	*/
	var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
	function stringifyToken(token) {
		switch (token.type) {
			case "block-scalar": {
				let res = "";
				for (const tok of token.props) res += stringifyToken(tok);
				return res + token.source;
			}
			case "block-map":
			case "block-seq": {
				let res = "";
				for (const item of token.items) res += stringifyItem(item);
				return res;
			}
			case "flow-collection": {
				let res = token.start.source;
				for (const item of token.items) res += stringifyItem(item);
				for (const st of token.end) res += st.source;
				return res;
			}
			case "document": {
				let res = stringifyItem(token);
				if (token.end) for (const st of token.end) res += st.source;
				return res;
			}
			default: {
				let res = token.source;
				if ("end" in token && token.end) for (const st of token.end) res += st.source;
				return res;
			}
		}
	}
	function stringifyItem({ start, key, sep, value }) {
		let res = "";
		for (const st of start) res += st.source;
		if (key) res += stringifyToken(key);
		if (sep) for (const st of sep) res += st.source;
		if (value) res += stringifyToken(value);
		return res;
	}
	exports.stringify = stringify;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = /* @__PURE__ */ __commonJSMin(((exports) => {
	var BREAK = Symbol("break visit");
	var SKIP = Symbol("skip children");
	var REMOVE = Symbol("remove item");
	/**
	* Apply a visitor to a CST document or item.
	*
	* Walks through the tree (depth-first) starting from the root, calling a
	* `visitor` function with two arguments when entering each item:
	*   - `item`: The current item, which included the following members:
	*     - `start: SourceToken[]` – Source tokens before the key or value,
	*       possibly including its anchor or tag.
	*     - `key?: Token | null` – Set for pair values. May then be `null`, if
	*       the key before the `:` separator is empty.
	*     - `sep?: SourceToken[]` – Source tokens between the key and the value,
	*       which should include the `:` map value indicator if `value` is set.
	*     - `value?: Token` – The value of a sequence item, or of a map pair.
	*   - `path`: The steps from the root to the current node, as an array of
	*     `['key' | 'value', number]` tuples.
	*
	* The return value of the visitor may be used to control the traversal:
	*   - `undefined` (default): Do nothing and continue
	*   - `visit.SKIP`: Do not visit the children of this token, continue with
	*      next sibling
	*   - `visit.BREAK`: Terminate traversal completely
	*   - `visit.REMOVE`: Remove the current item, then continue with the next one
	*   - `number`: Set the index of the next step. This is useful especially if
	*     the index of the current token has changed.
	*   - `function`: Define the next visitor for this item. After the original
	*     visitor is called on item entry, next visitors are called after handling
	*     a non-empty `key` and when exiting the item.
	*/
	function visit(cst, visitor) {
		if ("type" in cst && cst.type === "document") cst = {
			start: cst.start,
			value: cst.value
		};
		_visit(Object.freeze([]), cst, visitor);
	}
	/** Terminate visit traversal completely */
	visit.BREAK = BREAK;
	/** Do not visit the children of the current item */
	visit.SKIP = SKIP;
	/** Remove the current item */
	visit.REMOVE = REMOVE;
	/** Find the item at `path` from `cst` as the root */
	visit.itemAtPath = (cst, path) => {
		let item = cst;
		for (const [field, index] of path) {
			const tok = item?.[field];
			if (tok && "items" in tok) item = tok.items[index];
			else return void 0;
		}
		return item;
	};
	/**
	* Get the immediate parent collection of the item at `path` from `cst` as the root.
	*
	* Throws an error if the collection is not found, which should never happen if the item itself exists.
	*/
	visit.parentCollection = (cst, path) => {
		const parent = visit.itemAtPath(cst, path.slice(0, -1));
		const field = path[path.length - 1][0];
		const coll = parent?.[field];
		if (coll && "items" in coll) return coll;
		throw new Error("Parent collection not found");
	};
	function _visit(path, item, visitor) {
		let ctrl = visitor(item, path);
		if (typeof ctrl === "symbol") return ctrl;
		for (const field of ["key", "value"]) {
			const token = item[field];
			if (token && "items" in token) {
				for (let i = 0; i < token.items.length; ++i) {
					const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
					if (typeof ci === "number") i = ci - 1;
					else if (ci === BREAK) return BREAK;
					else if (ci === REMOVE) {
						token.items.splice(i, 1);
						i -= 1;
					}
				}
				if (typeof ctrl === "function" && field === "key") ctrl = ctrl(item, path);
			}
		}
		return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
	}
	exports.visit = visit;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst.js
var require_cst = /* @__PURE__ */ __commonJSMin(((exports) => {
	var cstScalar = require_cst_scalar();
	var cstStringify = require_cst_stringify();
	var cstVisit = require_cst_visit();
	/** The byte order mark */
	var BOM = "﻿";
	/** Start of doc-mode */
	var DOCUMENT = "";
	/** Unexpected end of flow-mode */
	var FLOW_END = "";
	/** Next token is a scalar value */
	var SCALAR = "";
	/** @returns `true` if `token` is a flow or block collection */
	var isCollection = (token) => !!token && "items" in token;
	/** @returns `true` if `token` is a flow or block scalar; not an alias */
	var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
	/* istanbul ignore next */
	/** Get a printable representation of a lexer token */
	function prettyToken(token) {
		switch (token) {
			case BOM: return "<BOM>";
			case DOCUMENT: return "<DOC>";
			case FLOW_END: return "<FLOW_END>";
			case SCALAR: return "<SCALAR>";
			default: return JSON.stringify(token);
		}
	}
	/** Identify the type of a lexer token. May return `null` for unknown tokens. */
	function tokenType(source) {
		switch (source) {
			case BOM: return "byte-order-mark";
			case DOCUMENT: return "doc-mode";
			case FLOW_END: return "flow-error-end";
			case SCALAR: return "scalar";
			case "---": return "doc-start";
			case "...": return "doc-end";
			case "":
			case "\n":
			case "\r\n": return "newline";
			case "-": return "seq-item-ind";
			case "?": return "explicit-key-ind";
			case ":": return "map-value-ind";
			case "{": return "flow-map-start";
			case "}": return "flow-map-end";
			case "[": return "flow-seq-start";
			case "]": return "flow-seq-end";
			case ",": return "comma";
		}
		switch (source[0]) {
			case " ":
			case "	": return "space";
			case "#": return "comment";
			case "%": return "directive-line";
			case "*": return "alias";
			case "&": return "anchor";
			case "!": return "tag";
			case "'": return "single-quoted-scalar";
			case "\"": return "double-quoted-scalar";
			case "|":
			case ">": return "block-scalar-header";
		}
		return null;
	}
	exports.createScalarToken = cstScalar.createScalarToken;
	exports.resolveAsScalar = cstScalar.resolveAsScalar;
	exports.setScalarValue = cstScalar.setScalarValue;
	exports.stringify = cstStringify.stringify;
	exports.visit = cstVisit.visit;
	exports.BOM = BOM;
	exports.DOCUMENT = DOCUMENT;
	exports.FLOW_END = FLOW_END;
	exports.SCALAR = SCALAR;
	exports.isCollection = isCollection;
	exports.isScalar = isScalar;
	exports.prettyToken = prettyToken;
	exports.tokenType = tokenType;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/lexer.js
var require_lexer = /* @__PURE__ */ __commonJSMin(((exports) => {
	var cst = require_cst();
	function isEmpty(ch) {
		switch (ch) {
			case void 0:
			case " ":
			case "\n":
			case "\r":
			case "	": return true;
			default: return false;
		}
	}
	var hexDigits = /* @__PURE__ */ new Set("0123456789ABCDEFabcdef");
	var tagChars = /* @__PURE__ */ new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
	var flowIndicatorChars = /* @__PURE__ */ new Set(",[]{}");
	var invalidAnchorChars = /* @__PURE__ */ new Set(" ,[]{}\n\r	");
	var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
	/**
	* Splits an input string into lexical tokens, i.e. smaller strings that are
	* easily identifiable by `tokens.tokenType()`.
	*
	* Lexing starts always in a "stream" context. Incomplete input may be buffered
	* until a complete token can be emitted.
	*
	* In addition to slices of the original input, the following control characters
	* may also be emitted:
	*
	* - `\x02` (Start of Text): A document starts with the next token
	* - `\x18` (Cancel): Unexpected end of flow-mode (indicates an error)
	* - `\x1f` (Unit Separator): Next token is a scalar value
	* - `\u{FEFF}` (Byte order mark): Emitted separately outside documents
	*/
	var Lexer = class {
		constructor() {
			/**
			* Flag indicating whether the end of the current buffer marks the end of
			* all input
			*/
			this.atEnd = false;
			/**
			* Explicit indent set in block scalar header, as an offset from the current
			* minimum indent, so e.g. set to 1 from a header `|2+`. Set to -1 if not
			* explicitly set.
			*/
			this.blockScalarIndent = -1;
			/**
			* Block scalars that include a + (keep) chomping indicator in their header
			* include trailing empty lines, which are otherwise excluded from the
			* scalar's contents.
			*/
			this.blockScalarKeep = false;
			/** Current input */
			this.buffer = "";
			/**
			* Flag noting whether the map value indicator : can immediately follow this
			* node within a flow context.
			*/
			this.flowKey = false;
			/** Count of surrounding flow collection levels. */
			this.flowLevel = 0;
			/**
			* Minimum level of indentation required for next lines to be parsed as a
			* part of the current scalar value.
			*/
			this.indentNext = 0;
			/** Indentation level of the current line. */
			this.indentValue = 0;
			/** Position of the next \n character. */
			this.lineEndPos = null;
			/** Stores the state of the lexer if reaching the end of incpomplete input */
			this.next = null;
			/** A pointer to `buffer`; the current position of the lexer. */
			this.pos = 0;
		}
		/**
		* Generate YAML tokens from the `source` string. If `incomplete`,
		* a part of the last line may be left as a buffer for the next call.
		*
		* @returns A generator of lexical tokens
		*/
		*lex(source, incomplete = false) {
			if (source) {
				if (typeof source !== "string") throw TypeError("source is not a string");
				this.buffer = this.buffer ? this.buffer + source : source;
				this.lineEndPos = null;
			}
			this.atEnd = !incomplete;
			let next = this.next ?? "stream";
			while (next && (incomplete || this.hasChars(1))) next = yield* this.parseNext(next);
		}
		atLineEnd() {
			let i = this.pos;
			let ch = this.buffer[i];
			while (ch === " " || ch === "	") ch = this.buffer[++i];
			if (!ch || ch === "#" || ch === "\n") return true;
			if (ch === "\r") return this.buffer[i + 1] === "\n";
			return false;
		}
		charAt(n) {
			return this.buffer[this.pos + n];
		}
		continueScalar(offset) {
			let ch = this.buffer[offset];
			if (this.indentNext > 0) {
				let indent = 0;
				while (ch === " ") ch = this.buffer[++indent + offset];
				if (ch === "\r") {
					const next = this.buffer[indent + offset + 1];
					if (next === "\n" || !next && !this.atEnd) return offset + indent + 1;
				}
				return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
			}
			if (ch === "-" || ch === ".") {
				const dt = this.buffer.substr(offset, 3);
				if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3])) return -1;
			}
			return offset;
		}
		getLine() {
			let end = this.lineEndPos;
			if (typeof end !== "number" || end !== -1 && end < this.pos) {
				end = this.buffer.indexOf("\n", this.pos);
				this.lineEndPos = end;
			}
			if (end === -1) return this.atEnd ? this.buffer.substring(this.pos) : null;
			if (this.buffer[end - 1] === "\r") end -= 1;
			return this.buffer.substring(this.pos, end);
		}
		hasChars(n) {
			return this.pos + n <= this.buffer.length;
		}
		setNext(state) {
			this.buffer = this.buffer.substring(this.pos);
			this.pos = 0;
			this.lineEndPos = null;
			this.next = state;
			return null;
		}
		peek(n) {
			return this.buffer.substr(this.pos, n);
		}
		*parseNext(next) {
			switch (next) {
				case "stream": return yield* this.parseStream();
				case "line-start": return yield* this.parseLineStart();
				case "block-start": return yield* this.parseBlockStart();
				case "doc": return yield* this.parseDocument();
				case "flow": return yield* this.parseFlowCollection();
				case "quoted-scalar": return yield* this.parseQuotedScalar();
				case "block-scalar": return yield* this.parseBlockScalar();
				case "plain-scalar": return yield* this.parsePlainScalar();
			}
		}
		*parseStream() {
			let line = this.getLine();
			if (line === null) return this.setNext("stream");
			if (line[0] === cst.BOM) {
				yield* this.pushCount(1);
				line = line.substring(1);
			}
			if (line[0] === "%") {
				let dirEnd = line.length;
				let cs = line.indexOf("#");
				while (cs !== -1) {
					const ch = line[cs - 1];
					if (ch === " " || ch === "	") {
						dirEnd = cs - 1;
						break;
					} else cs = line.indexOf("#", cs + 1);
				}
				while (true) {
					const ch = line[dirEnd - 1];
					if (ch === " " || ch === "	") dirEnd -= 1;
					else break;
				}
				const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
				yield* this.pushCount(line.length - n);
				this.pushNewline();
				return "stream";
			}
			if (this.atLineEnd()) {
				const sp = yield* this.pushSpaces(true);
				yield* this.pushCount(line.length - sp);
				yield* this.pushNewline();
				return "stream";
			}
			yield cst.DOCUMENT;
			return yield* this.parseLineStart();
		}
		*parseLineStart() {
			const ch = this.charAt(0);
			if (!ch && !this.atEnd) return this.setNext("line-start");
			if (ch === "-" || ch === ".") {
				if (!this.atEnd && !this.hasChars(4)) return this.setNext("line-start");
				const s = this.peek(3);
				if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
					yield* this.pushCount(3);
					this.indentValue = 0;
					this.indentNext = 0;
					return s === "---" ? "doc" : "stream";
				}
			}
			this.indentValue = yield* this.pushSpaces(false);
			if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1))) this.indentNext = this.indentValue;
			return yield* this.parseBlockStart();
		}
		*parseBlockStart() {
			const [ch0, ch1] = this.peek(2);
			if (!ch1 && !this.atEnd) return this.setNext("block-start");
			if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
				const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
				this.indentNext = this.indentValue + 1;
				this.indentValue += n;
				return "block-start";
			}
			return "doc";
		}
		*parseDocument() {
			yield* this.pushSpaces(true);
			const line = this.getLine();
			if (line === null) return this.setNext("doc");
			let n = yield* this.pushIndicators();
			switch (line[n]) {
				case "#": yield* this.pushCount(line.length - n);
				case void 0:
					yield* this.pushNewline();
					return yield* this.parseLineStart();
				case "{":
				case "[":
					yield* this.pushCount(1);
					this.flowKey = false;
					this.flowLevel = 1;
					return "flow";
				case "}":
				case "]":
					yield* this.pushCount(1);
					return "doc";
				case "*":
					yield* this.pushUntil(isNotAnchorChar);
					return "doc";
				case "\"":
				case "'": return yield* this.parseQuotedScalar();
				case "|":
				case ">":
					n += yield* this.parseBlockScalarHeader();
					n += yield* this.pushSpaces(true);
					yield* this.pushCount(line.length - n);
					yield* this.pushNewline();
					return yield* this.parseBlockScalar();
				default: return yield* this.parsePlainScalar();
			}
		}
		*parseFlowCollection() {
			let nl, sp;
			let indent = -1;
			do {
				nl = yield* this.pushNewline();
				if (nl > 0) {
					sp = yield* this.pushSpaces(false);
					this.indentValue = indent = sp;
				} else sp = 0;
				sp += yield* this.pushSpaces(true);
			} while (nl + sp > 0);
			const line = this.getLine();
			if (line === null) return this.setNext("flow");
			if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
				if (!(indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}"))) {
					this.flowLevel = 0;
					yield cst.FLOW_END;
					return yield* this.parseLineStart();
				}
			}
			let n = 0;
			while (line[n] === ",") {
				n += yield* this.pushCount(1);
				n += yield* this.pushSpaces(true);
				this.flowKey = false;
			}
			n += yield* this.pushIndicators();
			switch (line[n]) {
				case void 0: return "flow";
				case "#":
					yield* this.pushCount(line.length - n);
					return "flow";
				case "{":
				case "[":
					yield* this.pushCount(1);
					this.flowKey = false;
					this.flowLevel += 1;
					return "flow";
				case "}":
				case "]":
					yield* this.pushCount(1);
					this.flowKey = true;
					this.flowLevel -= 1;
					return this.flowLevel ? "flow" : "doc";
				case "*":
					yield* this.pushUntil(isNotAnchorChar);
					return "flow";
				case "\"":
				case "'":
					this.flowKey = true;
					return yield* this.parseQuotedScalar();
				case ":": {
					const next = this.charAt(1);
					if (this.flowKey || isEmpty(next) || next === ",") {
						this.flowKey = false;
						yield* this.pushCount(1);
						yield* this.pushSpaces(true);
						return "flow";
					}
				}
				default:
					this.flowKey = false;
					return yield* this.parsePlainScalar();
			}
		}
		*parseQuotedScalar() {
			const quote = this.charAt(0);
			let end = this.buffer.indexOf(quote, this.pos + 1);
			if (quote === "'") while (end !== -1 && this.buffer[end + 1] === "'") end = this.buffer.indexOf("'", end + 2);
			else while (end !== -1) {
				let n = 0;
				while (this.buffer[end - 1 - n] === "\\") n += 1;
				if (n % 2 === 0) break;
				end = this.buffer.indexOf("\"", end + 1);
			}
			const qb = this.buffer.substring(0, end);
			let nl = qb.indexOf("\n", this.pos);
			if (nl !== -1) {
				while (nl !== -1) {
					const cs = this.continueScalar(nl + 1);
					if (cs === -1) break;
					nl = qb.indexOf("\n", cs);
				}
				if (nl !== -1) end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
			}
			if (end === -1) {
				if (!this.atEnd) return this.setNext("quoted-scalar");
				end = this.buffer.length;
			}
			yield* this.pushToIndex(end + 1, false);
			return this.flowLevel ? "flow" : "doc";
		}
		*parseBlockScalarHeader() {
			this.blockScalarIndent = -1;
			this.blockScalarKeep = false;
			let i = this.pos;
			while (true) {
				const ch = this.buffer[++i];
				if (ch === "+") this.blockScalarKeep = true;
				else if (ch > "0" && ch <= "9") this.blockScalarIndent = Number(ch) - 1;
				else if (ch !== "-") break;
			}
			return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
		}
		*parseBlockScalar() {
			let nl = this.pos - 1;
			let indent = 0;
			let ch;
			loop: for (let i = this.pos; ch = this.buffer[i]; ++i) switch (ch) {
				case " ":
					indent += 1;
					break;
				case "\n":
					nl = i;
					indent = 0;
					break;
				case "\r": {
					const next = this.buffer[i + 1];
					if (!next && !this.atEnd) return this.setNext("block-scalar");
					if (next === "\n") break;
				}
				default: break loop;
			}
			if (!ch && !this.atEnd) return this.setNext("block-scalar");
			if (indent >= this.indentNext) {
				if (this.blockScalarIndent === -1) this.indentNext = indent;
				else this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
				do {
					const cs = this.continueScalar(nl + 1);
					if (cs === -1) break;
					nl = this.buffer.indexOf("\n", cs);
				} while (nl !== -1);
				if (nl === -1) {
					if (!this.atEnd) return this.setNext("block-scalar");
					nl = this.buffer.length;
				}
			}
			let i = nl + 1;
			ch = this.buffer[i];
			while (ch === " ") ch = this.buffer[++i];
			if (ch === "	") {
				while (ch === "	" || ch === " " || ch === "\r" || ch === "\n") ch = this.buffer[++i];
				nl = i - 1;
			} else if (!this.blockScalarKeep) do {
				let i = nl - 1;
				let ch = this.buffer[i];
				if (ch === "\r") ch = this.buffer[--i];
				const lastChar = i;
				while (ch === " ") ch = this.buffer[--i];
				if (ch === "\n" && i >= this.pos && i + 1 + indent > lastChar) nl = i;
				else break;
			} while (true);
			yield cst.SCALAR;
			yield* this.pushToIndex(nl + 1, true);
			return yield* this.parseLineStart();
		}
		*parsePlainScalar() {
			const inFlow = this.flowLevel > 0;
			let end = this.pos - 1;
			let i = this.pos - 1;
			let ch;
			while (ch = this.buffer[++i]) if (ch === ":") {
				const next = this.buffer[i + 1];
				if (isEmpty(next) || inFlow && flowIndicatorChars.has(next)) break;
				end = i;
			} else if (isEmpty(ch)) {
				let next = this.buffer[i + 1];
				if (ch === "\r") {
					if (next === "\n") {
						i += 1;
						ch = "\n";
						next = this.buffer[i + 1];
					} else end = i;
				}
				if (next === "#" || inFlow && flowIndicatorChars.has(next)) break;
				if (ch === "\n") {
					const cs = this.continueScalar(i + 1);
					if (cs === -1) break;
					i = Math.max(i, cs - 2);
				}
			} else {
				if (inFlow && flowIndicatorChars.has(ch)) break;
				end = i;
			}
			if (!ch && !this.atEnd) return this.setNext("plain-scalar");
			yield cst.SCALAR;
			yield* this.pushToIndex(end + 1, true);
			return inFlow ? "flow" : "doc";
		}
		*pushCount(n) {
			if (n > 0) {
				yield this.buffer.substr(this.pos, n);
				this.pos += n;
				return n;
			}
			return 0;
		}
		*pushToIndex(i, allowEmpty) {
			const s = this.buffer.slice(this.pos, i);
			if (s) {
				yield s;
				this.pos += s.length;
				return s.length;
			} else if (allowEmpty) yield "";
			return 0;
		}
		*pushIndicators() {
			let n = 0;
			loop: while (true) {
				switch (this.charAt(0)) {
					case "!":
						n += yield* this.pushTag();
						n += yield* this.pushSpaces(true);
						continue loop;
					case "&":
						n += yield* this.pushUntil(isNotAnchorChar);
						n += yield* this.pushSpaces(true);
						continue loop;
					case "-":
					case "?":
					case ":": {
						const inFlow = this.flowLevel > 0;
						const ch1 = this.charAt(1);
						if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
							if (!inFlow) this.indentNext = this.indentValue + 1;
							else if (this.flowKey) this.flowKey = false;
							n += yield* this.pushCount(1);
							n += yield* this.pushSpaces(true);
							continue loop;
						}
					}
				}
				break loop;
			}
			return n;
		}
		*pushTag() {
			if (this.charAt(1) === "<") {
				let i = this.pos + 2;
				let ch = this.buffer[i];
				while (!isEmpty(ch) && ch !== ">") ch = this.buffer[++i];
				return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
			} else {
				let i = this.pos + 1;
				let ch = this.buffer[i];
				while (ch) if (tagChars.has(ch)) ch = this.buffer[++i];
				else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) ch = this.buffer[i += 3];
				else break;
				return yield* this.pushToIndex(i, false);
			}
		}
		*pushNewline() {
			const ch = this.buffer[this.pos];
			if (ch === "\n") return yield* this.pushCount(1);
			else if (ch === "\r" && this.charAt(1) === "\n") return yield* this.pushCount(2);
			else return 0;
		}
		*pushSpaces(allowTabs) {
			let i = this.pos - 1;
			let ch;
			do
				ch = this.buffer[++i];
			while (ch === " " || allowTabs && ch === "	");
			const n = i - this.pos;
			if (n > 0) {
				yield this.buffer.substr(this.pos, n);
				this.pos = i;
			}
			return n;
		}
		*pushUntil(test) {
			let i = this.pos;
			let ch = this.buffer[i];
			while (!test(ch)) ch = this.buffer[++i];
			return yield* this.pushToIndex(i, false);
		}
	};
	exports.Lexer = Lexer;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = /* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* Tracks newlines during parsing in order to provide an efficient API for
	* determining the one-indexed `{ line, col }` position for any offset
	* within the input.
	*/
	var LineCounter = class {
		constructor() {
			this.lineStarts = [];
			/**
			* Should be called in ascending order. Otherwise, call
			* `lineCounter.lineStarts.sort()` before calling `linePos()`.
			*/
			this.addNewLine = (offset) => this.lineStarts.push(offset);
			/**
			* Performs a binary search and returns the 1-indexed { line, col }
			* position of `offset`. If `line === 0`, `addNewLine` has never been
			* called or `offset` is before the first known newline.
			*/
			this.linePos = (offset) => {
				let low = 0;
				let high = this.lineStarts.length;
				while (low < high) {
					const mid = low + high >> 1;
					if (this.lineStarts[mid] < offset) low = mid + 1;
					else high = mid;
				}
				if (this.lineStarts[low] === offset) return {
					line: low + 1,
					col: 1
				};
				if (low === 0) return {
					line: 0,
					col: offset
				};
				const start = this.lineStarts[low - 1];
				return {
					line: low,
					col: offset - start + 1
				};
			};
		}
	};
	exports.LineCounter = LineCounter;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/parser.js
var require_parser = /* @__PURE__ */ __commonJSMin(((exports) => {
	var node_process = __require("process");
	var cst = require_cst();
	var lexer = require_lexer();
	function includesToken(list, type) {
		for (let i = 0; i < list.length; ++i) if (list[i].type === type) return true;
		return false;
	}
	function findNonEmptyIndex(list) {
		for (let i = 0; i < list.length; ++i) switch (list[i].type) {
			case "space":
			case "comment":
			case "newline": break;
			default: return i;
		}
		return -1;
	}
	function isFlowToken(token) {
		switch (token?.type) {
			case "alias":
			case "scalar":
			case "single-quoted-scalar":
			case "double-quoted-scalar":
			case "flow-collection": return true;
			default: return false;
		}
	}
	function getPrevProps(parent) {
		switch (parent.type) {
			case "document": return parent.start;
			case "block-map": {
				const it = parent.items[parent.items.length - 1];
				return it.sep ?? it.start;
			}
			case "block-seq": return parent.items[parent.items.length - 1].start;
			/* istanbul ignore next should not happen */
			default: return [];
		}
	}
	/** Note: May modify input array */
	function getFirstKeyStartProps(prev) {
		if (prev.length === 0) return [];
		let i = prev.length;
		loop: while (--i >= 0) switch (prev[i].type) {
			case "doc-start":
			case "explicit-key-ind":
			case "map-value-ind":
			case "seq-item-ind":
			case "newline": break loop;
		}
		while (prev[++i]?.type === "space");
		return prev.splice(i, prev.length);
	}
	function arrayPushArray(target, source) {
		if (source.length < 1e5) Array.prototype.push.apply(target, source);
		else for (let i = 0; i < source.length; ++i) target.push(source[i]);
	}
	function fixFlowSeqItems(fc) {
		if (fc.start.type === "flow-seq-start") {
			for (const it of fc.items) if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
				if (it.key) it.value = it.key;
				delete it.key;
				if (isFlowToken(it.value)) {
					if (it.value.end) arrayPushArray(it.value.end, it.sep);
					else it.value.end = it.sep;
				} else arrayPushArray(it.start, it.sep);
				delete it.sep;
			}
		}
	}
	/**
	* A YAML concrete syntax tree (CST) parser
	*
	* ```ts
	* const src: string = ...
	* for (const token of new Parser().parse(src)) {
	*   // token: Token
	* }
	* ```
	*
	* To use the parser with a user-provided lexer:
	*
	* ```ts
	* function* parse(source: string, lexer: Lexer) {
	*   const parser = new Parser()
	*   for (const lexeme of lexer.lex(source))
	*     yield* parser.next(lexeme)
	*   yield* parser.end()
	* }
	*
	* const src: string = ...
	* const lexer = new Lexer()
	* for (const token of parse(src, lexer)) {
	*   // token: Token
	* }
	* ```
	*/
	var Parser = class {
		/**
		* @param onNewLine - If defined, called separately with the start position of
		*   each new line (in `parse()`, including the start of input).
		*/
		constructor(onNewLine) {
			/** If true, space and sequence indicators count as indentation */
			this.atNewLine = true;
			/** If true, next token is a scalar value */
			this.atScalar = false;
			/** Current indentation level */
			this.indent = 0;
			/** Current offset since the start of parsing */
			this.offset = 0;
			/** On the same line with a block map key */
			this.onKeyLine = false;
			/** Top indicates the node that's currently being built */
			this.stack = [];
			/** The source of the current token, set in parse() */
			this.source = "";
			/** The type of the current token, set in parse() */
			this.type = "";
			this.lexer = new lexer.Lexer();
			this.onNewLine = onNewLine;
		}
		/**
		* Parse `source` as a YAML stream.
		* If `incomplete`, a part of the last line may be left as a buffer for the next call.
		*
		* Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
		*
		* @returns A generator of tokens representing each directive, document, and other structure.
		*/
		*parse(source, incomplete = false) {
			if (this.onNewLine && this.offset === 0) this.onNewLine(0);
			for (const lexeme of this.lexer.lex(source, incomplete)) yield* this.next(lexeme);
			if (!incomplete) yield* this.end();
		}
		/**
		* Advance the parser by the `source` of one lexical token.
		*/
		*next(source) {
			this.source = source;
			if (node_process.env.LOG_TOKENS) console.log("|", cst.prettyToken(source));
			if (this.atScalar) {
				this.atScalar = false;
				yield* this.step();
				this.offset += source.length;
				return;
			}
			const type = cst.tokenType(source);
			if (!type) {
				const message = `Not a YAML token: ${source}`;
				yield* this.pop({
					type: "error",
					offset: this.offset,
					message,
					source
				});
				this.offset += source.length;
			} else if (type === "scalar") {
				this.atNewLine = false;
				this.atScalar = true;
				this.type = "scalar";
			} else {
				this.type = type;
				yield* this.step();
				switch (type) {
					case "newline":
						this.atNewLine = true;
						this.indent = 0;
						if (this.onNewLine) this.onNewLine(this.offset + source.length);
						break;
					case "space":
						if (this.atNewLine && source[0] === " ") this.indent += source.length;
						break;
					case "explicit-key-ind":
					case "map-value-ind":
					case "seq-item-ind":
						if (this.atNewLine) this.indent += source.length;
						break;
					case "doc-mode":
					case "flow-error-end": return;
					default: this.atNewLine = false;
				}
				this.offset += source.length;
			}
		}
		/** Call at end of input to push out any remaining constructions */
		*end() {
			while (this.stack.length > 0) yield* this.pop();
		}
		get sourceToken() {
			return {
				type: this.type,
				offset: this.offset,
				indent: this.indent,
				source: this.source
			};
		}
		*step() {
			const top = this.peek(1);
			if (this.type === "doc-end" && top?.type !== "doc-end") {
				while (this.stack.length > 0) yield* this.pop();
				this.stack.push({
					type: "doc-end",
					offset: this.offset,
					source: this.source
				});
				return;
			}
			if (!top) return yield* this.stream();
			switch (top.type) {
				case "document": return yield* this.document(top);
				case "alias":
				case "scalar":
				case "single-quoted-scalar":
				case "double-quoted-scalar": return yield* this.scalar(top);
				case "block-scalar": return yield* this.blockScalar(top);
				case "block-map": return yield* this.blockMap(top);
				case "block-seq": return yield* this.blockSequence(top);
				case "flow-collection": return yield* this.flowCollection(top);
				case "doc-end": return yield* this.documentEnd(top);
			}
			/* istanbul ignore next should not happen */
			yield* this.pop();
		}
		peek(n) {
			return this.stack[this.stack.length - n];
		}
		*pop(error) {
			const token = error ?? this.stack.pop();
			/* istanbul ignore if should not happen */
			if (!token) yield {
				type: "error",
				offset: this.offset,
				source: "",
				message: "Tried to pop an empty stack"
			};
			else if (this.stack.length === 0) yield token;
			else {
				const top = this.peek(1);
				if (token.type === "block-scalar") token.indent = "indent" in top ? top.indent : 0;
				else if (token.type === "flow-collection" && top.type === "document") token.indent = 0;
				if (token.type === "flow-collection") fixFlowSeqItems(token);
				switch (top.type) {
					case "document":
						top.value = token;
						break;
					case "block-scalar":
						top.props.push(token);
						break;
					case "block-map": {
						const it = top.items[top.items.length - 1];
						if (it.value) {
							top.items.push({
								start: [],
								key: token,
								sep: []
							});
							this.onKeyLine = true;
							return;
						} else if (it.sep) it.value = token;
						else {
							Object.assign(it, {
								key: token,
								sep: []
							});
							this.onKeyLine = !it.explicitKey;
							return;
						}
						break;
					}
					case "block-seq": {
						const it = top.items[top.items.length - 1];
						if (it.value) top.items.push({
							start: [],
							value: token
						});
						else it.value = token;
						break;
					}
					case "flow-collection": {
						const it = top.items[top.items.length - 1];
						if (!it || it.value) top.items.push({
							start: [],
							key: token,
							sep: []
						});
						else if (it.sep) it.value = token;
						else Object.assign(it, {
							key: token,
							sep: []
						});
						return;
					}
					/* istanbul ignore next should not happen */
					default:
						yield* this.pop();
						yield* this.pop(token);
				}
				if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
					const last = token.items[token.items.length - 1];
					if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
						if (top.type === "document") top.end = last.start;
						else top.items.push({ start: last.start });
						token.items.splice(-1, 1);
					}
				}
			}
		}
		*stream() {
			switch (this.type) {
				case "directive-line":
					yield {
						type: "directive",
						offset: this.offset,
						source: this.source
					};
					return;
				case "byte-order-mark":
				case "space":
				case "comment":
				case "newline":
					yield this.sourceToken;
					return;
				case "doc-mode":
				case "doc-start": {
					const doc = {
						type: "document",
						offset: this.offset,
						start: []
					};
					if (this.type === "doc-start") doc.start.push(this.sourceToken);
					this.stack.push(doc);
					return;
				}
			}
			yield {
				type: "error",
				offset: this.offset,
				message: `Unexpected ${this.type} token in YAML stream`,
				source: this.source
			};
		}
		*document(doc) {
			if (doc.value) return yield* this.lineEnd(doc);
			switch (this.type) {
				case "doc-start":
					if (findNonEmptyIndex(doc.start) !== -1) {
						yield* this.pop();
						yield* this.step();
					} else doc.start.push(this.sourceToken);
					return;
				case "anchor":
				case "tag":
				case "space":
				case "comment":
				case "newline":
					doc.start.push(this.sourceToken);
					return;
			}
			const bv = this.startBlockValue(doc);
			if (bv) this.stack.push(bv);
			else yield {
				type: "error",
				offset: this.offset,
				message: `Unexpected ${this.type} token in YAML document`,
				source: this.source
			};
		}
		*scalar(scalar) {
			if (this.type === "map-value-ind") {
				const start = getFirstKeyStartProps(getPrevProps(this.peek(2)));
				let sep;
				if (scalar.end) {
					sep = scalar.end;
					sep.push(this.sourceToken);
					delete scalar.end;
				} else sep = [this.sourceToken];
				const map = {
					type: "block-map",
					offset: scalar.offset,
					indent: scalar.indent,
					items: [{
						start,
						key: scalar,
						sep
					}]
				};
				this.onKeyLine = true;
				this.stack[this.stack.length - 1] = map;
			} else yield* this.lineEnd(scalar);
		}
		*blockScalar(scalar) {
			switch (this.type) {
				case "space":
				case "comment":
				case "newline":
					scalar.props.push(this.sourceToken);
					return;
				case "scalar":
					scalar.source = this.source;
					this.atNewLine = true;
					this.indent = 0;
					if (this.onNewLine) {
						let nl = this.source.indexOf("\n") + 1;
						while (nl !== 0) {
							this.onNewLine(this.offset + nl);
							nl = this.source.indexOf("\n", nl) + 1;
						}
					}
					yield* this.pop();
					break;
				/* istanbul ignore next should not happen */
				default:
					yield* this.pop();
					yield* this.step();
			}
		}
		*blockMap(map) {
			const it = map.items[map.items.length - 1];
			switch (this.type) {
				case "newline":
					this.onKeyLine = false;
					if (it.value) {
						const end = "end" in it.value ? it.value.end : void 0;
						if ((Array.isArray(end) ? end[end.length - 1] : void 0)?.type === "comment") end?.push(this.sourceToken);
						else map.items.push({ start: [this.sourceToken] });
					} else if (it.sep) it.sep.push(this.sourceToken);
					else it.start.push(this.sourceToken);
					return;
				case "space":
				case "comment":
					if (it.value) map.items.push({ start: [this.sourceToken] });
					else if (it.sep) it.sep.push(this.sourceToken);
					else {
						if (this.atIndentedComment(it.start, map.indent)) {
							const end = map.items[map.items.length - 2]?.value?.end;
							if (Array.isArray(end)) {
								arrayPushArray(end, it.start);
								end.push(this.sourceToken);
								map.items.pop();
								return;
							}
						}
						it.start.push(this.sourceToken);
					}
					return;
			}
			if (this.indent >= map.indent) {
				const atMapIndent = !this.onKeyLine && this.indent === map.indent;
				const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
				let start = [];
				if (atNextItem && it.sep && !it.value) {
					const nl = [];
					for (let i = 0; i < it.sep.length; ++i) {
						const st = it.sep[i];
						switch (st.type) {
							case "newline":
								nl.push(i);
								break;
							case "space": break;
							case "comment":
								if (st.indent > map.indent) nl.length = 0;
								break;
							default: nl.length = 0;
						}
					}
					if (nl.length >= 2) start = it.sep.splice(nl[1]);
				}
				switch (this.type) {
					case "anchor":
					case "tag":
						if (atNextItem || it.value) {
							start.push(this.sourceToken);
							map.items.push({ start });
							this.onKeyLine = true;
						} else if (it.sep) it.sep.push(this.sourceToken);
						else it.start.push(this.sourceToken);
						return;
					case "explicit-key-ind":
						if (!it.sep && !it.explicitKey) {
							it.start.push(this.sourceToken);
							it.explicitKey = true;
						} else if (atNextItem || it.value) {
							start.push(this.sourceToken);
							map.items.push({
								start,
								explicitKey: true
							});
						} else this.stack.push({
							type: "block-map",
							offset: this.offset,
							indent: this.indent,
							items: [{
								start: [this.sourceToken],
								explicitKey: true
							}]
						});
						this.onKeyLine = true;
						return;
					case "map-value-ind":
						if (it.explicitKey) {
							if (!it.sep) {
								if (includesToken(it.start, "newline")) Object.assign(it, {
									key: null,
									sep: [this.sourceToken]
								});
								else {
									const start = getFirstKeyStartProps(it.start);
									this.stack.push({
										type: "block-map",
										offset: this.offset,
										indent: this.indent,
										items: [{
											start,
											key: null,
											sep: [this.sourceToken]
										}]
									});
								}
							} else if (it.value) map.items.push({
								start: [],
								key: null,
								sep: [this.sourceToken]
							});
							else if (includesToken(it.sep, "map-value-ind")) this.stack.push({
								type: "block-map",
								offset: this.offset,
								indent: this.indent,
								items: [{
									start,
									key: null,
									sep: [this.sourceToken]
								}]
							});
							else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
								const start = getFirstKeyStartProps(it.start);
								const key = it.key;
								const sep = it.sep;
								sep.push(this.sourceToken);
								delete it.key;
								delete it.sep;
								this.stack.push({
									type: "block-map",
									offset: this.offset,
									indent: this.indent,
									items: [{
										start,
										key,
										sep
									}]
								});
							} else if (start.length > 0) it.sep = it.sep.concat(start, this.sourceToken);
							else it.sep.push(this.sourceToken);
						} else if (!it.sep) Object.assign(it, {
							key: null,
							sep: [this.sourceToken]
						});
						else if (it.value || atNextItem) map.items.push({
							start,
							key: null,
							sep: [this.sourceToken]
						});
						else if (includesToken(it.sep, "map-value-ind")) this.stack.push({
							type: "block-map",
							offset: this.offset,
							indent: this.indent,
							items: [{
								start: [],
								key: null,
								sep: [this.sourceToken]
							}]
						});
						else it.sep.push(this.sourceToken);
						this.onKeyLine = true;
						return;
					case "alias":
					case "scalar":
					case "single-quoted-scalar":
					case "double-quoted-scalar": {
						const fs = this.flowScalar(this.type);
						if (atNextItem || it.value) {
							map.items.push({
								start,
								key: fs,
								sep: []
							});
							this.onKeyLine = true;
						} else if (it.sep) this.stack.push(fs);
						else {
							Object.assign(it, {
								key: fs,
								sep: []
							});
							this.onKeyLine = true;
						}
						return;
					}
					default: {
						const bv = this.startBlockValue(map);
						if (bv) {
							if (bv.type === "block-seq") {
								if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
									yield* this.pop({
										type: "error",
										offset: this.offset,
										message: "Unexpected block-seq-ind on same line with key",
										source: this.source
									});
									return;
								}
							} else if (atMapIndent) map.items.push({ start });
							this.stack.push(bv);
							return;
						}
					}
				}
			}
			yield* this.pop();
			yield* this.step();
		}
		*blockSequence(seq) {
			const it = seq.items[seq.items.length - 1];
			switch (this.type) {
				case "newline":
					if (it.value) {
						const end = "end" in it.value ? it.value.end : void 0;
						if ((Array.isArray(end) ? end[end.length - 1] : void 0)?.type === "comment") end?.push(this.sourceToken);
						else seq.items.push({ start: [this.sourceToken] });
					} else it.start.push(this.sourceToken);
					return;
				case "space":
				case "comment":
					if (it.value) seq.items.push({ start: [this.sourceToken] });
					else {
						if (this.atIndentedComment(it.start, seq.indent)) {
							const end = seq.items[seq.items.length - 2]?.value?.end;
							if (Array.isArray(end)) {
								arrayPushArray(end, it.start);
								end.push(this.sourceToken);
								seq.items.pop();
								return;
							}
						}
						it.start.push(this.sourceToken);
					}
					return;
				case "anchor":
				case "tag":
					if (it.value || this.indent <= seq.indent) break;
					it.start.push(this.sourceToken);
					return;
				case "seq-item-ind":
					if (this.indent !== seq.indent) break;
					if (it.value || includesToken(it.start, "seq-item-ind")) seq.items.push({ start: [this.sourceToken] });
					else it.start.push(this.sourceToken);
					return;
			}
			if (this.indent > seq.indent) {
				const bv = this.startBlockValue(seq);
				if (bv) {
					this.stack.push(bv);
					return;
				}
			}
			yield* this.pop();
			yield* this.step();
		}
		*flowCollection(fc) {
			const it = fc.items[fc.items.length - 1];
			if (this.type === "flow-error-end") {
				let top;
				do {
					yield* this.pop();
					top = this.peek(1);
				} while (top?.type === "flow-collection");
			} else if (fc.end.length === 0) {
				switch (this.type) {
					case "comma":
					case "explicit-key-ind":
						if (!it || it.sep) fc.items.push({ start: [this.sourceToken] });
						else it.start.push(this.sourceToken);
						return;
					case "map-value-ind":
						if (!it || it.value) fc.items.push({
							start: [],
							key: null,
							sep: [this.sourceToken]
						});
						else if (it.sep) it.sep.push(this.sourceToken);
						else Object.assign(it, {
							key: null,
							sep: [this.sourceToken]
						});
						return;
					case "space":
					case "comment":
					case "newline":
					case "anchor":
					case "tag":
						if (!it || it.value) fc.items.push({ start: [this.sourceToken] });
						else if (it.sep) it.sep.push(this.sourceToken);
						else it.start.push(this.sourceToken);
						return;
					case "alias":
					case "scalar":
					case "single-quoted-scalar":
					case "double-quoted-scalar": {
						const fs = this.flowScalar(this.type);
						if (!it || it.value) fc.items.push({
							start: [],
							key: fs,
							sep: []
						});
						else if (it.sep) this.stack.push(fs);
						else Object.assign(it, {
							key: fs,
							sep: []
						});
						return;
					}
					case "flow-map-end":
					case "flow-seq-end":
						fc.end.push(this.sourceToken);
						return;
				}
				const bv = this.startBlockValue(fc);
				/* istanbul ignore else should not happen */
				if (bv) this.stack.push(bv);
				else {
					yield* this.pop();
					yield* this.step();
				}
			} else {
				const parent = this.peek(2);
				if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
					yield* this.pop();
					yield* this.step();
				} else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
					const start = getFirstKeyStartProps(getPrevProps(parent));
					fixFlowSeqItems(fc);
					const sep = fc.end.splice(1, fc.end.length);
					sep.push(this.sourceToken);
					const map = {
						type: "block-map",
						offset: fc.offset,
						indent: fc.indent,
						items: [{
							start,
							key: fc,
							sep
						}]
					};
					this.onKeyLine = true;
					this.stack[this.stack.length - 1] = map;
				} else yield* this.lineEnd(fc);
			}
		}
		flowScalar(type) {
			if (this.onNewLine) {
				let nl = this.source.indexOf("\n") + 1;
				while (nl !== 0) {
					this.onNewLine(this.offset + nl);
					nl = this.source.indexOf("\n", nl) + 1;
				}
			}
			return {
				type,
				offset: this.offset,
				indent: this.indent,
				source: this.source
			};
		}
		startBlockValue(parent) {
			switch (this.type) {
				case "alias":
				case "scalar":
				case "single-quoted-scalar":
				case "double-quoted-scalar": return this.flowScalar(this.type);
				case "block-scalar-header": return {
					type: "block-scalar",
					offset: this.offset,
					indent: this.indent,
					props: [this.sourceToken],
					source: ""
				};
				case "flow-map-start":
				case "flow-seq-start": return {
					type: "flow-collection",
					offset: this.offset,
					indent: this.indent,
					start: this.sourceToken,
					items: [],
					end: []
				};
				case "seq-item-ind": return {
					type: "block-seq",
					offset: this.offset,
					indent: this.indent,
					items: [{ start: [this.sourceToken] }]
				};
				case "explicit-key-ind": {
					this.onKeyLine = true;
					const start = getFirstKeyStartProps(getPrevProps(parent));
					start.push(this.sourceToken);
					return {
						type: "block-map",
						offset: this.offset,
						indent: this.indent,
						items: [{
							start,
							explicitKey: true
						}]
					};
				}
				case "map-value-ind": {
					this.onKeyLine = true;
					const start = getFirstKeyStartProps(getPrevProps(parent));
					return {
						type: "block-map",
						offset: this.offset,
						indent: this.indent,
						items: [{
							start,
							key: null,
							sep: [this.sourceToken]
						}]
					};
				}
			}
			return null;
		}
		atIndentedComment(start, indent) {
			if (this.type !== "comment") return false;
			if (this.indent <= indent) return false;
			return start.every((st) => st.type === "newline" || st.type === "space");
		}
		*documentEnd(docEnd) {
			if (this.type !== "doc-mode") {
				if (docEnd.end) docEnd.end.push(this.sourceToken);
				else docEnd.end = [this.sourceToken];
				if (this.type === "newline") yield* this.pop();
			}
		}
		*lineEnd(token) {
			switch (this.type) {
				case "comma":
				case "doc-start":
				case "doc-end":
				case "flow-seq-end":
				case "flow-map-end":
				case "map-value-ind":
					yield* this.pop();
					yield* this.step();
					break;
				case "newline": this.onKeyLine = false;
				default:
					if (token.end) token.end.push(this.sourceToken);
					else token.end = [this.sourceToken];
					if (this.type === "newline") yield* this.pop();
			}
		}
	};
	exports.Parser = Parser;
}));
// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/public-api.js
var require_public_api = /* @__PURE__ */ __commonJSMin(((exports) => {
	var composer = require_composer();
	var Document = require_Document();
	var errors = require_errors$1();
	var log = require_log();
	var identity = require_identity();
	var lineCounter = require_line_counter();
	var parser = require_parser();
	function parseOptions(options) {
		const prettyErrors = options.prettyErrors !== false;
		return {
			lineCounter: options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null,
			prettyErrors
		};
	}
	/**
	* Parse the input as a stream of YAML documents.
	*
	* Documents should be separated from each other by `...` or `---` marker lines.
	*
	* @returns If an empty `docs` array is returned, it will be of type
	*   EmptyStream and contain additional stream information. In
	*   TypeScript, you should use `'empty' in docs` as a type guard for it.
	*/
	function parseAllDocuments(source, options = {}) {
		const { lineCounter, prettyErrors } = parseOptions(options);
		const parser$1 = new parser.Parser(lineCounter?.addNewLine);
		const composer$1 = new composer.Composer(options);
		const docs = Array.from(composer$1.compose(parser$1.parse(source)));
		if (prettyErrors && lineCounter) for (const doc of docs) {
			doc.errors.forEach(errors.prettifyError(source, lineCounter));
			doc.warnings.forEach(errors.prettifyError(source, lineCounter));
		}
		if (docs.length > 0) return docs;
		return Object.assign([], { empty: true }, composer$1.streamInfo());
	}
	/** Parse an input string into a single YAML.Document */
	function parseDocument(source, options = {}) {
		const { lineCounter, prettyErrors } = parseOptions(options);
		const parser$1 = new parser.Parser(lineCounter?.addNewLine);
		const composer$1 = new composer.Composer(options);
		let doc = null;
		for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) if (!doc) doc = _doc;
		else if (doc.options.logLevel !== "silent") {
			doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
			break;
		}
		if (prettyErrors && lineCounter) {
			doc.errors.forEach(errors.prettifyError(source, lineCounter));
			doc.warnings.forEach(errors.prettifyError(source, lineCounter));
		}
		return doc;
	}
	function parse(src, reviver, options) {
		let _reviver = void 0;
		if (typeof reviver === "function") _reviver = reviver;
		else if (options === void 0 && reviver && typeof reviver === "object") options = reviver;
		const doc = parseDocument(src, options);
		if (!doc) return null;
		doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
		if (doc.errors.length > 0) {
			if (doc.options.logLevel !== "silent") throw doc.errors[0];
			else doc.errors = [];
		}
		return doc.toJS(Object.assign({ reviver: _reviver }, options));
	}
	function stringify(value, replacer, options) {
		let _replacer = null;
		if (typeof replacer === "function" || Array.isArray(replacer)) _replacer = replacer;
		else if (options === void 0 && replacer) options = replacer;
		if (typeof options === "string") options = options.length;
		if (typeof options === "number") {
			const indent = Math.round(options);
			options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
		}
		if (value === void 0) {
			const { keepUndefined } = options ?? replacer ?? {};
			if (!keepUndefined) return void 0;
		}
		if (identity.isDocument(value) && !_replacer) return value.toString(options);
		return new Document.Document(value, _replacer, options).toString(options);
	}
	exports.parse = parse;
	exports.parseAllDocuments = parseAllDocuments;
	exports.parseDocument = parseDocument;
	exports.stringify = stringify;
}));
// src/paths.ts
var import_dist$1 = (/* @__PURE__ */ __commonJSMin(((exports) => {
	var composer = require_composer();
	var Document = require_Document();
	var Schema = require_Schema();
	var errors = require_errors$1();
	var Alias = require_Alias();
	var identity = require_identity();
	var Pair = require_Pair();
	var Scalar = require_Scalar();
	var YAMLMap = require_YAMLMap();
	var YAMLSeq = require_YAMLSeq();
	require_cst();
	var lexer = require_lexer();
	var lineCounter = require_line_counter();
	var parser = require_parser();
	var publicApi = require_public_api();
	var visit = require_visit();
	exports.Composer = composer.Composer;
	exports.Document = Document.Document;
	exports.Schema = Schema.Schema;
	exports.YAMLError = errors.YAMLError;
	exports.YAMLParseError = errors.YAMLParseError;
	exports.YAMLWarning = errors.YAMLWarning;
	exports.Alias = Alias.Alias;
	exports.isAlias = identity.isAlias;
	exports.isCollection = identity.isCollection;
	exports.isDocument = identity.isDocument;
	exports.isMap = identity.isMap;
	exports.isNode = identity.isNode;
	exports.isPair = identity.isPair;
	exports.isScalar = identity.isScalar;
	exports.isSeq = identity.isSeq;
	exports.Pair = Pair.Pair;
	exports.Scalar = Scalar.Scalar;
	exports.YAMLMap = YAMLMap.YAMLMap;
	exports.YAMLSeq = YAMLSeq.YAMLSeq;
	exports.Lexer = lexer.Lexer;
	exports.LineCounter = lineCounter.LineCounter;
	exports.Parser = parser.Parser;
	exports.parse = publicApi.parse;
	exports.parseAllDocuments = publicApi.parseAllDocuments;
	exports.parseDocument = publicApi.parseDocument;
	exports.stringify = publicApi.stringify;
	exports.visit = visit.visit;
	exports.visitAsync = visit.visitAsync;
})))();
var FACTORY_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
var VIEWER_HEALTH = "skill-factory-viewer";
var DEFAULT_VIEWER_PORT = 7340;
function defaultDataDir() {
	return process.env.FACTORY_DATA_DIR ?? homeDataDir();
}
function homeDataDir() {
	return path.join(os.homedir(), ".skill-factory");
}
function sourcesFile() {
	return path.join(homeDataDir(), "sources.json");
}
function readSources() {
	try {
		const dirs = JSON.parse(fs.readFileSync(sourcesFile(), "utf8")).dirs;
		return Array.isArray(dirs) ? dirs.filter((d) => typeof d === "string") : [];
	} catch {
		return [];
	}
}
function registerDataSource(dataDir) {
	const dir = path.resolve(dataDir);
	if (dir === path.resolve(homeDataDir())) return;
	const dirs = readSources().filter((d) => fs.existsSync(d));
	if (!dirs.includes(dir)) dirs.push(dir);
	fs.mkdirSync(homeDataDir(), { recursive: true });
	fs.writeFileSync(sourcesFile(), `${JSON.stringify({ dirs }, null, 2)}\n`);
}
function viewerOptions(dataDir) {
	return {
		viewerDir: process.env.FACTORY_VIEWER_DIR ?? path.join(FACTORY_DIR, "app", "dist"),
		dataDir,
		factoryDir: FACTORY_DIR,
		configFile: process.env.FACTORY_CONFIG ?? path.join(FACTORY_DIR, "config", "factory.yaml")
	};
}
// src/marketplace-agents.ts
var AGENT_NAME = /^[a-z0-9-]+$/;
var CLAUDE_TOOLS = {
	read: [
		"Read",
		"Grep",
		"Glob"
	],
	edit: ["Edit", "Write"],
	bash: ["Bash"]
};
var CLAUDE_ALL_TOOLS = [
	"Read",
	"Grep",
	"Glob",
	"Skill",
	"Edit",
	"Write",
	"Bash",
	"WebFetch",
	"WebSearch",
	"Agent",
	"Task",
	"NotebookEdit"
];
function marketplaceDir() {
	return process.env.FACTORY_MARKETPLACE_DIR ?? path.join(FACTORY_DIR, "..");
}
function readFrontmatter(file) {
	const match = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match?.[1] || match[2] === void 0) throw new Error(`${file}: no frontmatter`);
	return {
		front: (0, import_dist$1.parse)(match[1]),
		raw: match[1],
		body: match[2].trim()
	};
}
function findSkill(name) {
	const root = path.join(marketplaceDir(), "skills");
	if (!fs.existsSync(root)) return void 0;
	for (const category of fs.readdirSync(root)) {
		const file = path.join(root, category, name, "SKILL.md");
		if (fs.existsSync(file)) return file;
	}
	const plugins = path.join(marketplaceDir(), "plugins");
	if (!fs.existsSync(plugins)) return void 0;
	return fs.readdirSync(plugins).map((p) => path.join(plugins, p, "skills", name, "SKILL.md")).find((f) => fs.existsSync(f));
}
function findPluginAgent(name) {
	const plugins = path.join(marketplaceDir(), "plugins");
	if (!fs.existsSync(plugins)) return void 0;
	return fs.readdirSync(plugins).map((p) => path.join(plugins, p, "agents", `${name}.md`)).find((f) => fs.existsSync(f));
}
function findPluginSkill(ref, pluginRoot) {
	const [plugin, skill] = ref.includes(":") ? ref.split(":", 2) : [path.basename(pluginRoot), ref];
	const file = path.join(marketplaceDir(), "plugins", plugin, "skills", skill, "SKILL.md");
	return fs.existsSync(file) ? file : findSkill(skill);
}
function withPluginRoot(text, pluginRoot) {
	return pluginRoot ? text.split("${CLAUDE_PLUGIN_ROOT}").join(pluginRoot) : text;
}
function declaredSkills(name, front) {
	const allowed = Object.entries(front.permission?.skill ?? {}).filter(([skill, rule]) => skill !== "*" && rule === "allow").map(([skill]) => skill);
	const manifest = path.join(marketplaceDir(), "agents", "opencode", "index.json");
	const listed = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, "utf8")).agents.find((a) => a.name === name)?.skills ?? [] : [];
	return [.../* @__PURE__ */ new Set([...allowed, ...listed])];
}
function skillsSection(skills, missing, pluginRoot) {
	const root = pluginRoot ? `\n\nCLAUDE_PLUGIN_ROOT is ${pluginRoot}; use that path wherever a skill or these instructions write \${CLAUDE_PLUGIN_ROOT}.` : "";
	if (!skills.length && !missing.length) return root;
	const lines = skills.map((s) => `- ${s.name}: ${s.file}`);
	const absent = missing.length ? `\nNot in the marketplace, so not available in this run: ${missing.join(", ")}.` : "";
	return `${root}\n\nSkills: when these instructions load a skill or say a skill is preloaded, read its SKILL.md from the marketplace path below and follow it, not through the Skill tool and not from an installed copy. Files a skill names are next to its SKILL.md.\n${lines.join("\n")}${absent}`;
}
function readMarketplaceAgent(name) {
	if (!AGENT_NAME.test(name)) throw new Error(`invalid agent name ${name}`);
	const file = path.join(marketplaceDir(), "agents", "opencode", `${name}.md`);
	if (fs.existsSync(file)) {
		const { front, raw, body } = readFrontmatter(file);
		const names = declaredSkills(name, front);
		const skills = names.flatMap((skill) => {
			const found = findSkill(skill);
			return found ? [{
				name: skill,
				file: found
			}] : [];
		});
		const missing = names.filter((skill) => !skills.some((s) => s.name === skill));
		return {
			name,
			description: front.description ?? name,
			prompt: body + skillsSection(skills, missing),
			file,
			frontmatter: raw,
			skills,
			dirs: skills.map((s) => path.dirname(s.file))
		};
	}
	const pluginFile = findPluginAgent(name);
	if (pluginFile) {
		const pluginRoot = path.dirname(path.dirname(pluginFile));
		const { front, raw, body } = readFrontmatter(pluginFile);
		const refs = front.skills ?? [];
		const skills = refs.flatMap((ref) => {
			const found = findPluginSkill(ref, pluginRoot);
			return found ? [{
				name: ref,
				file: found
			}] : [];
		});
		const missing = refs.filter((ref) => !skills.some((s) => s.name === ref));
		return {
			name,
			description: front.description ?? name,
			prompt: withPluginRoot(body, pluginRoot) + skillsSection(skills, missing, pluginRoot),
			file: pluginFile,
			frontmatter: raw,
			skills,
			dirs: [pluginRoot, ...skills.map((s) => path.dirname(s.file))],
			pluginRoot
		};
	}
	const skillFile = findSkill(name);
	if (!skillFile) throw new Error(`agent or skill ${name} is not in the marketplace (${file})`);
	const skillDir = path.dirname(skillFile);
	const pluginRoot = path.basename(path.dirname(path.dirname(path.dirname(skillDir)))) === "plugins" ? path.dirname(path.dirname(skillDir)) : void 0;
	const { front, body } = readFrontmatter(skillFile);
	const prompt = `Follow the skill ${name} below for the task in the user message. The skill directory is ${skillDir}; read the files it names from there.\n\n${withPluginRoot(body, pluginRoot)}${skillsSection([], [], pluginRoot)}`;
	return {
		name,
		description: front.description ?? name,
		prompt,
		file: skillFile,
		frontmatter: "",
		skills: [],
		dirs: pluginRoot ? [pluginRoot, skillDir] : [skillDir],
		skillDir,
		...pluginRoot ? { pluginRoot } : {}
	};
}
function skillDescription(file) {
	try {
		return String(readFrontmatter(file).front.description ?? "").replace(/\s+/g, " ").trim();
	} catch {
		return "";
	}
}
function describeAgent(name) {
	let agent;
	try {
		agent = readMarketplaceAgent(name);
	} catch {
		return null;
	}
	const root = marketplaceDir();
	const rel = (f) => path.relative(root, f).split(path.sep).join("/");
	const kind = agent.skillDir ? "skill" : agent.pluginRoot ? "plugin-agent" : "agent";
	const declared = kind === "skill" ? [] : agent.skills;
	const fromPrompt = agent.prompt.match(/Not in the marketplace, so not available in this run: ([^\n]+)\./)?.[1]?.split(", ") ?? [];
	return {
		name,
		kind,
		description: String(agent.description).replace(/\s+/g, " ").trim(),
		file: rel(agent.file),
		skills: declared.map((s) => ({
			name: s.name,
			description: skillDescription(s.file),
			file: rel(s.file)
		})),
		missing: fromPrompt
	};
}
function claudeTools(tools) {
	const allowed = [...new Set(tools.flatMap((t) => CLAUDE_TOOLS[t]))];
	return {
		allowed,
		disallowed: CLAUDE_ALL_TOOLS.filter((t) => !allowed.includes(t))
	};
}
function freshDir(prefix) {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function claudeAgentsFile(name, tools = ["read"]) {
	const agent = readMarketplaceAgent(name);
	const file = path.join(freshDir("factory-agent-"), `claude-${name}.json`);
	fs.writeFileSync(file, JSON.stringify({ [name]: {
		description: agent.description,
		prompt: agent.prompt,
		tools: claudeTools(tools).allowed
	} }));
	return file;
}
function opencodeConfigDir(name, tools = ["read"]) {
	const agent = readMarketplaceAgent(name);
	const dir = freshDir("factory-opencode-");
	const target = path.join(dir, "agents", `${name}.md`);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	if (agent.skillDir || agent.pluginRoot) {
		const allow = (tool) => tools.includes(tool) ? "allow" : "deny";
		const front = {
			description: agent.description,
			mode: "subagent",
			permission: {
				edit: allow("edit"),
				bash: allow("bash"),
				task: "deny",
				webfetch: "deny",
				websearch: "deny",
				external_directory: "allow"
			}
		};
		fs.writeFileSync(target, `---\n${JSON.stringify(front)}\n---\n\n${agent.prompt}\n`);
	} else fs.writeFileSync(target, `---\n${agent.frontmatter}\n---\n\n${agent.prompt}\n`);
	return dir;
}
// src/impl-ops.ts
var STACKS = [
	{
		id: "dotnet",
		pattern: /\.net\b|c#|csproj|asp\.net|\.cs\b/i,
		extensions: [".cs", ".csproj"]
	},
	{
		id: "mobile",
		pattern: /kotlin|android|\.kt\b/i,
		extensions: [".kt", ".kts"]
	},
	{
		id: "react-native",
		pattern: /react native|expo/i,
		extensions: []
	},
	{
		id: "react",
		pattern: /\breact\b(?! native)|\.tsx\b/i,
		extensions: [".ts", ".tsx"]
	},
	{
		id: "army-python",
		pattern: /\bpython\b|\.py\b/i,
		extensions: [".py"]
	}
];
var AGENT_PREFIX = {
	dotnet: "olko-dotnet",
	mobile: "olko-mobile",
	"react-native": "olko-react-native",
	react: "olko-react",
	"army-python": "olko-army-python"
};
var CODE_EXTENSIONS = [
	".cs",
	".ts",
	".tsx",
	".js",
	".jsx",
	".kt",
	".kts",
	".py"
];
var CONTEXT_FILE = /(^|\/)(AGENTS|CODING_STYLE|TESTING|CLAUDE)\.md$/;
var DOC_PATH = /(^|\/)(docs|plans)\/|\.md$/i;
var TEST_PATH = /(^|\/)tests?\/|tests?\.(cs|ts|tsx|kt|py)$|test_[^/]+\.py$|\.(test|spec)\.(ts|tsx)$/i;
function stateOf$1(state, key) {
	const value = state[key];
	if (value === void 0) throw new Error(`state.${key} is not set`);
	return value;
}
function section(text, title) {
	const lines = text.split(/\r?\n/);
	const start = lines.findIndex((l) => /^#{2,4}\s/.test(l) && title.test(l));
	if (start < 0) return "";
	const level = lines[start].match(/^#+/)[0].length;
	const end = lines.findIndex((l, i) => i > start && new RegExp(`^#{1,${level}}\\s`).test(l));
	return lines.slice(start + 1, end < 0 ? void 0 : end).join("\n").trim();
}
function appendJournal(file, line) {
	if (!fs.existsSync(file)) return;
	const text = fs.readFileSync(file, "utf8");
	const entry = `- ${(/* @__PURE__ */ new Date()).toISOString().replace(/\.\d+Z$/, "Z")} ${line.replace(/\r?\n/g, " ").slice(0, 600)}`;
	if (/^## Implementation\s*$/m.test(text)) fs.writeFileSync(file, `${text.replace(/\s*$/, "")}\n${entry}\n`);
	else fs.writeFileSync(file, `${text.replace(/\s*$/, "")}\n\n## Implementation\n\n${entry}\n`);
}
function taskOf(state, input) {
	const task = state.task;
	if (task) return task;
	if (!input.plan) throw new Error("no Task in state and no input.plan");
	return {
		ok: true,
		featureId: "",
		featureDir: path.dirname(path.dirname(input.plan)),
		featurePlan: path.join(path.dirname(path.dirname(input.plan)), "implementation.md"),
		tracker: "",
		taskFile: input.plan,
		taskName: path.basename(input.plan).replace(/-implementation\.md$/, ""),
		criteria: input.criteria ?? ""
	};
}
function baseOf(state, input) {
	const base = state.worktree?.base ?? input.base;
	if (!base) throw new Error("no base branch: run the worktree step first or give input.base");
	return base;
}
function lastLine(text, prefix) {
	const line = String(text).split(/\r?\n/).map((l) => l.trim().replace(/^`+|`+$/g, "")).reverse().find((l) => l.toLowerCase().startsWith(`${prefix} |`));
	return line ? line.split("|").map((p) => p.trim()) : null;
}
function parseLine(prefix) {
	return (text) => {
		const fields = lastLine(text, prefix);
		if (!fields) throw new Error(`output has no '${prefix} |' line`);
		return {
			verdict: (fields[1] ?? "").toLowerCase(),
			detail: fields.slice(2).join(" | "),
			fields: fields.slice(1),
			text: String(text).slice(-4e3)
		};
	};
}
function parseChunks(text) {
	const block = [...String(text).matchAll(/```json\s*([\s\S]*?)```/g)].map((m) => m[1]).pop();
	if (!block) throw new Error("chunker output has no ```json block");
	const parsed = JSON.parse(block);
	if (!Array.isArray(parsed.chunks) || parsed.chunks.length === 0) throw new Error("chunker returned no chunks");
	return { chunks: parsed.chunks.map((c) => ({
		stack: String(c.stack ?? ""),
		title: String(c.title ?? ""),
		files: (c.files ?? []).map(String),
		brief: String(c.brief ?? "")
	})) };
}
function results(state, node) {
	return Object.entries(state[node] ?? {});
}
async function changed(exec, root, base) {
	return (await localDiff(exec, root, base)).files;
}
function addedLines(file) {
	return file.diff.split(/\r?\n/).filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
}
function hashFile(file) {
	return fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : "missing";
}
var implTask = async ({ input, state, nodeId }) => {
	const visits = ((nodeId ? state[nodeId] : void 0)?.visits ?? 0) + 1;
	const root = path.resolve(input.project ?? ".");
	const planned = state.plan?.feature?.featureId;
	const featureId = input.featureId ?? planned ?? "";
	const featureDir = path.join(root, "plans", "features", featureId);
	const tasksDir = path.join(featureDir, "tasks");
	const tasks = featureId && fs.existsSync(tasksDir) ? fs.readdirSync(tasksDir).filter((f) => f.endsWith("-implementation.md")).sort() : [];
	const pick = input.taskId ? tasks.find((f) => f.startsWith(input.taskId)) : tasks[0];
	const taskFile = pick ? path.join(tasksDir, pick) : "";
	const text = taskFile ? fs.readFileSync(taskFile, "utf8") : "";
	const criteria = section(text, /acceptance/i);
	const ready = /ready for implementation:\s*\**\s*yes/i.test(text);
	const reason = !featureId ? "no featureId in the input" : !pick ? `no approved Task plan in ${path.relative(root, tasksDir)}` : !criteria ? `${pick} has no acceptance criteria` : !ready ? `${pick} does not say Ready for implementation: yes` : "";
	const ok = reason === "";
	const canPlan = !ok && visits === 1 && Boolean(input.idea);
	const task = {
		ok,
		canPlan,
		stop: !ok && !canPlan,
		visits,
		reason,
		featureId,
		featureDir,
		featurePlan: path.join(featureDir, "implementation.md"),
		tracker: path.join(featureDir, "feature-tracker.md"),
		taskFile,
		taskName: pick ? pick.replace(/-implementation\.md$/, "") : "",
		criteria
	};
	return {
		state: task,
		metrics: {
			ok: ok ? 1 : 0,
			tasks: tasks.length
		},
		output: ok ? `Task ${task.taskName} of Feature ${featureId}: acceptance criteria present, plan ready.` : `Entry gate: ${reason}.${canPlan ? " Routing to plan documentation." : ""}`
	};
};
var implWorktree = async ({ input, state, exec }) => {
	if (!exec) throw new Error("impl.worktree needs the host exec tool");
	const task = stateOf$1(state, "task");
	const root = path.resolve(input.project ?? ".");
	const current = await exec("git", [
		"-C",
		root,
		"branch",
		"--show-current"
	]);
	const base = current.stdout.trim();
	if (current.code !== 0 || !base) throw new Error(`the main checkout ${root} is not on a branch`);
	const slug = task.taskName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
	const branch = `feature/${slug}`;
	const target = path.join(path.dirname(root), `${path.basename(root)}-worktrees`, slug);
	let resumed = false;
	if (fs.existsSync(path.join(target, ".git"))) resumed = true;
	else {
		fs.mkdirSync(path.dirname(target), { recursive: true });
		const add = await exec("git", [
			"-C",
			root,
			"worktree",
			"add",
			...(await exec("git", [
				"-C",
				root,
				"rev-parse",
				"--verify",
				"--quiet",
				`refs/heads/${branch}`
			])).code === 0 ? [target, branch] : [
				"-b",
				branch,
				target,
				"HEAD"
			]
		]);
		if (add.code !== 0) throw new Error(`git worktree add failed: ${add.stderr.slice(-300)}`);
	}
	const workspace = fs.realpathSync.native(target);
	return {
		state: {
			path: workspace,
			branch,
			base,
			resumed
		},
		workspace,
		metrics: { resumed: resumed ? 1 : 0 },
		output: `${resumed ? "Resumed" : "Created"} worktree ${workspace} on ${branch} (base ${base}). Every later agent and operation runs there.`
	};
};
var implJournal = async ({ state, exec }) => {
	const task = stateOf$1(state, "task");
	const worktree = stateOf$1(state, "worktree");
	const text = fs.readFileSync(task.taskFile, "utf8");
	if (!/^## Implementation\s*$/m.test(text)) fs.writeFileSync(task.taskFile, `${text.replace(/\s*$/, "")}\n\n## Implementation\n\n- Session status: in progress\n- Current step: preflight\n- Worktree: ${worktree.path}\n- Branch: ${worktree.branch} (base ${worktree.base})\n\n### Log\n`);
	appendJournal(task.taskFile, worktree.resumed ? "resumed by the factory run" : "started by the factory run");
	if (!fs.existsSync(task.tracker)) {
		const head = exec ? (await exec("git", [
			"-C",
			worktree.path,
			"rev-parse",
			"HEAD"
		])).stdout.trim() : "";
		fs.writeFileSync(task.tracker, `# Feature tracker: ${task.featureId}\n\n- Base commit: ${head}\n\n## Tasks\n\n- ${task.taskName}: in progress on ${worktree.branch}\n\n## Pending\n\n## Final Feature audit\n\nnot run\n`);
	}
	return {
		state: {
			journal: task.taskFile,
			tracker: task.tracker
		},
		metrics: {},
		output: `Journal in ${task.taskFile}; Feature tracker ${task.tracker}.`
	};
};
var implPreflight = async ({ state, nodeId }) => {
	const task = stateOf$1(state, "task");
	const round = ((nodeId ? state[nodeId] : void 0)?.round ?? 0) + 1;
	const verdicts = results(state, "workers");
	const lines = [
		"flow",
		"runtime",
		"test",
		"readiness"
	].map((id) => {
		const v = verdicts.find(([k]) => k === id)?.[1];
		return {
			id,
			verdict: v ? v.verdict.toUpperCase() : "MISSING",
			detail: v?.detail ?? "no result"
		};
	});
	const pass = lines.every((l) => l.verdict === "PASS");
	const text = lines.map((l) => `${l.id}: ${l.verdict} | ${l.detail}`).join("\n");
	appendJournal(task.taskFile, `preflight round ${round}: ${lines.map((l) => `${l.id}=${l.verdict}`).join(", ")}`);
	return {
		state: {
			round,
			pass,
			next: pass ? "pass" : round < 3 ? "ask" : "stop",
			text,
			reason: `preflight did not pass after ${round} rounds:\n${text}`
		},
		metrics: {
			pass: pass ? 1 : 0,
			round
		},
		output: pass ? "Preflight: four PASS results; implementation may start." : `Preflight round ${round}: not all PASS.\n${text}`
	};
};
var implStacks = async ({ state, input }) => {
	const task = taskOf(state, input);
	const text = [task.taskFile, task.featurePlan].filter((f) => f && fs.existsSync(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
	const stacks = STACKS.filter((s) => s.pattern.test(text)).map((s) => s.id);
	if (stacks.length === 0) throw new Error(`no known stack named in ${task.taskFile}`);
	const prefix = (s) => AGENT_PREFIX[s];
	const as = (role) => stacks.map((s) => ({
		id: s,
		agentName: role === "author" ? "olko-test-first-author" : `${prefix(s)}-${role}`,
		role: role === "author" ? "implementer" : role === "test-runner" ? "runner" : "implementer"
	}));
	return {
		state: {
			stacks,
			authors: as("author"),
			implementers: as("implementer"),
			runners: as("test-runner")
		},
		metrics: { stacks: stacks.length },
		output: `Stacks of this Task: ${stacks.join(", ")}.`
	};
};
var implTestsFirst = async ({ state, input, answers, nodeId, exec, cwd }) => {
	const task = taskOf(state, input);
	const previous = nodeId ? state[nodeId] : void 0;
	const round = (previous?.round ?? 0) + 1;
	const answer = previous ? answers?.[`q-impl-unclear-${previous.round}`] : void 0;
	const answered = [previous?.answered, answer].filter(Boolean).join("\n");
	const written = results(state, "write-tests");
	const open = written.flatMap(([stack, r]) => r.fields.slice(1).filter((f) => !/^(unclear|blocked):\s*none\s*$/i.test(f) && /^(unclear|blocked):/i.test(f)).map((f) => `${stack}: ${f}`));
	const count = written.reduce((sum, [, r]) => sum + (Number(r.verdict) || 0), 0);
	const testFiles = {};
	if (exec && cwd) {
		for (const file of await changed(exec, cwd, baseOf(state, input))) if (TEST_PATH.test(file.path)) testFiles[file.path] = hashFile(path.join(cwd, file.path));
	}
	appendJournal(task.taskFile, `failing tests first, round ${round}: ${count} tests written (${Object.keys(testFiles).join(", ") || "no test file changed"}); open items: ${open.length}`);
	const next = open.length === 0 ? "done" : round < 3 ? "ask" : "stop";
	return {
		state: {
			round,
			count,
			open: open.length,
			questions: open.join("\n"),
			answered: answered || "none",
			testFiles,
			testList: Object.keys(testFiles).join(", ") || "none",
			next,
			reason: `criteria still unclear after ${round} rounds:\n${open.join("\n")}`
		},
		metrics: {
			tests: count,
			open: open.length,
			files: Object.keys(testFiles).length
		},
		output: `${count} failing tests written; ${Object.keys(testFiles).length} test files; ${open.length} open items.`
	};
};
var implChunkPlan = async ({ state }) => {
	const stacks = stateOf$1(state, "stacks");
	const parsed = Object.values(stateOf$1(state, "chunker"))[0];
	const owner = /* @__PURE__ */ new Map();
	const chunks = parsed.chunks.map((c, index) => {
		const agent = stacks.implementers.find((a) => a.id === c.stack) ?? stacks.implementers[0];
		const files = c.files.filter((f) => {
			if (owner.has(f)) return false;
			owner.set(f, index);
			return true;
		});
		return {
			index,
			title: c.title,
			stack: agent.id,
			files,
			brief: c.brief,
			agents: [agent]
		};
	});
	return {
		state: { chunks },
		metrics: { chunks: chunks.length },
		output: `${chunks.length} chunks: ${chunks.map((c) => `${c.index + 1}. ${c.stack} ${c.title}`).join("; ")}.`
	};
};
var implChildCheck = async ({ state, input, exec, cwd, nodeId }) => {
	if (!exec || !cwd) throw new Error("impl.childCheck needs the host exec tool");
	const task = taskOf(state, input);
	const chunk = stateOf$1(state, "chunk-next").item;
	const previous = nodeId ? state[nodeId] : void 0;
	const attempts = previous?.chunk === chunk.index ? (previous.attempts ?? 0) + 1 : 1;
	const edgeRuns = previous?.edgeRuns ?? 0;
	const result = Object.values(state.implement ?? {})[0];
	const verdict = result?.verdict ?? "missing";
	const frozen = state["tests-check"]?.testFiles ?? {};
	const violations = [];
	for (const file of await changed(exec, cwd, baseOf(state, input))) {
		if (/^\.github\/workflows\/|azure-pipelines|\.gitlab-ci/.test(file.path)) violations.push(`${file.path}: CI/CD workflow file changed without explicit permission`);
		if (frozen[file.path] !== void 0) {
			if (hashFile(path.join(cwd, file.path)) !== frozen[file.path]) violations.push(`${file.path}: a failing-test-first file was changed`);
			continue;
		}
		if (!CODE_EXTENSIONS.some((e) => file.path.endsWith(e))) continue;
		const python = file.path.endsWith(".py");
		for (const line of addedLines(file)) {
			if (python ? /^\s*#(?!!)/.test(line) : /^\s*(\/\/(?!\/)|\/\*)/.test(line)) violations.push(`${file.path}: explanatory comment added: ${line.trim().slice(0, 120)}`);
			if (/\b(AC|D)\d+\b|\bMAIN-\d+\b/.test(line)) violations.push(`${file.path}: plan or criterion id inside code: ${line.trim().slice(0, 120)}`);
		}
	}
	const next = violations.length ? attempts < 3 ? "fix" : "stop" : verdict === "blocked" ? "blocked" : verdict === "dispute" ? "dispute" : verdict === "edge-cases" && edgeRuns === 0 ? "edge" : "done";
	appendJournal(task.taskFile, `chunk ${chunk.index + 1} (${chunk.stack} ${chunk.title}) attempt ${attempts}: ${verdict}; ${violations.length} rule violations`);
	return {
		state: {
			chunk: chunk.index,
			attempts,
			edgeRuns: next === "edge" ? edgeRuns + 1 : edgeRuns,
			verdict,
			next,
			violations: violations.join("\n"),
			detail: result?.detail ?? "",
			report: result?.text ?? "",
			reason: `chunk ${chunk.index + 1} still breaks the child-result rules after ${attempts} attempts:\n${violations.join("\n")}`
		},
		metrics: {
			violations: violations.length,
			attempts
		},
		output: violations.length ? `Chunk ${chunk.index + 1}: ${violations.length} violations.\n${violations.join("\n")}` : `Chunk ${chunk.index + 1}: ${verdict}.`
	};
};
var implDispute = async ({ state }) => {
	const result = Object.values(state.dispute ?? {})[0];
	const justified = result?.verdict === "justified";
	return {
		state: {
			justified,
			next: justified ? "ask" : "implement",
			detail: result?.detail ?? ""
		},
		metrics: { justified: justified ? 1 : 0 },
		output: justified ? `The test author keeps the test: ${result?.detail}` : `The test author changed the test: ${result?.detail ?? "no detail"}`
	};
};
var implChecks = async ({ state, input, nodeId }) => {
	const task = taskOf(state, input);
	const round = ((nodeId ? state[nodeId] : void 0)?.round ?? 0) + 1;
	const style = results(state, "style");
	const tests = results(state, "runners");
	const failures = [...style.map(([id, r]) => ({
		kind: "style",
		id,
		...r
	})), ...tests.map(([id, r]) => ({
		kind: "tests",
		id,
		...r
	}))].filter((r) => r.verdict !== "pass");
	const pass = failures.length === 0 && style.length > 0 && tests.length > 0;
	const text = failures.map((f) => `${f.kind} ${f.id}: ${f.verdict} | ${f.detail}`).join("\n");
	appendJournal(task.taskFile, `checks round ${round}: ${pass ? "style and tests pass" : text}`);
	const inTests = (f) => f.kind === "style" && /Tests?\.(cs|ts|tsx|kt|py)\b|(^|[\s`(/])tests?\/|\.(test|spec)\.|test_\w+\.py/i.test(f.detail);
	const testFailures = failures.filter(inTests);
	const codeFailures = failures.filter((f) => !inTests(f));
	const next = pass ? "pass" : round >= 4 ? "stop" : testFailures.length ? "fix-tests" : "fix";
	const lineOf = (f) => `${f.kind} ${f.id}: ${f.verdict} | ${f.detail}`;
	return {
		state: {
			round,
			pass,
			next,
			failures: codeFailures.map(lineOf).join("\n") || "none",
			testFailures: testFailures.map(lineOf).join("\n") || "none",
			reason: `style or tests still fail after ${round} rounds:\n${text}`
		},
		metrics: {
			failures: failures.length,
			round
		},
		output: pass ? "Style and affected tests pass." : `Round ${round}: ${failures.length} failing checks.\n${text}`
	};
};
var implDocker = async ({ state, input }) => {
	const task = taskOf(state, input);
	const docker = Object.values(state["docker-rebuild"] ?? {})[0];
	const runtime = results(state, "runtime");
	const verified = docker?.verdict === "pass" && runtime.length > 0 && runtime.every(([, r]) => r.verdict === "verified");
	const text = [`docker: ${docker?.verdict ?? "missing"} | ${docker?.detail ?? ""}`, ...runtime.map(([id, r]) => `runtime ${id}: ${r.verdict} | ${r.detail}`)].join("\n");
	appendJournal(task.taskFile, `isolated Docker and runtime verification: ${verified ? "VERIFIED" : "NOT VERIFIED"}`);
	if (task.tracker && fs.existsSync(task.tracker)) fs.appendFileSync(task.tracker, `\n### Runtime evidence ${task.taskName}\n\n${text}\n`);
	return {
		state: {
			verified,
			next: verified ? "pass" : "stop",
			text,
			reason: `runtime verification failed:\n${text}`
		},
		metrics: { verified: verified ? 1 : 0 },
		output: verified ? "Isolated Docker rebuild and runtime evidence: VERIFIED." : `NOT VERIFIED:\n${text}`
	};
};
var implContextFiles = async ({ state, input, exec, cwd }) => {
	if (!exec || !cwd) throw new Error("impl.contextFiles needs the host exec tool");
	const files = (await changed(exec, cwd, baseOf(state, input))).map((f) => f.path).filter((p) => CONTEXT_FILE.test(p) && fs.existsSync(path.join(cwd, p)) && fs.readFileSync(path.join(cwd, p), "utf8").split(/\r?\n/).length >= 20);
	return {
		state: {
			files,
			count: files.length,
			list: files.join("\n") || "none"
		},
		metrics: { files: files.length },
		output: files.length ? `Context files to optimize: ${files.join(", ")}.` : "No agent-context file of 20 lines or more changed."
	};
};
var implScopeGate = async ({ state, input, exec, cwd }) => {
	if (!exec || !cwd) throw new Error("impl.scopeGate needs the host exec tool");
	const files = (await changed(exec, cwd, baseOf(state, input))).map((f) => f.path);
	const code = files.filter((p) => !DOC_PATH.test(p));
	const docs = files.filter((p) => DOC_PATH.test(p));
	const over = code.length > 15;
	return {
		state: {
			count: code.length,
			docs: docs.length,
			over,
			paths: code.join("\n")
		},
		metrics: {
			code: code.length,
			docs: docs.length
		},
		output: `${code.length} code paths${over ? " (more than 15: needs an explicit extension)" : ""}, ${docs.length} documentation paths.`
	};
};
var implReviewGate = async ({ state, input, nodeId }) => {
	const task = taskOf(state, input);
	const round = ((nodeId ? state[nodeId] : void 0)?.round ?? 0) + 1;
	const review = state.review ?? {};
	const kept = (review["local-rank"] ?? review.rank)?.kept ?? [];
	const blocking = kept.filter((f) => ["bug", "security"].includes(tierOf$1(f)) || /^req\.(missing|partial)/.test(f.ruleId) || /merge/i.test(f.ruleId));
	const other = kept.filter((f) => !blocking.includes(f));
	appendJournal(task.taskFile, `Task review round ${round}: ${blocking.length} blocking, ${other.length} non-blocking findings`);
	if (task.tracker && fs.existsSync(task.tracker)) fs.appendFileSync(task.tracker, `\n### Task review ${task.taskName} round ${round}\n\n${kept.map((f) => `- ${f.line}`).join("\n") || "- no findings"}\n`);
	const next = blocking.length === 0 ? "pass" : round < 3 ? "fix" : "stop";
	return {
		state: {
			round,
			blocking: blocking.length,
			next,
			text: blocking.map((f) => f.line).join("\n") || "none",
			nonBlocking: other.map((f) => f.line).join("\n") || "none",
			reason: `blocking review findings remain after ${round} rounds:\n${blocking.map((f) => f.line).join("\n")}`
		},
		metrics: {
			blocking: blocking.length,
			nonBlocking: other.length
		},
		output: blocking.length ? `${blocking.length} blocking findings:\n${blocking.map((f) => f.line).join("\n")}` : `No blocking finding (${other.length} non-blocking recorded).`
	};
};
var implStop = async ({ state, args }) => {
	const reason = state[String(args.from ?? "")]?.reason ?? String(args.reason ?? "stopped");
	throw new Error(`Implementation stopped: ${reason}`);
};
var implOpenEditor = async ({ exec, cwd }) => {
	if (!exec || !cwd) throw new Error("impl.openEditor needs the host exec tool");
	const result = await exec("code", ["--new-window", cwd]);
	return {
		state: { opened: result.code === 0 },
		metrics: { opened: result.code === 0 ? 1 : 0 },
		output: result.code === 0 ? `Opened ${cwd} in a new VS Code window.` : `Could not open VS Code; run: code --new-window "${cwd}"`
	};
};
var implReport = async ({ state, input }) => {
	const task = taskOf(state, input);
	const worktree = state.worktree;
	const get = (key) => state[key];
	const chunks = get("chunk-plan")?.chunks.length ?? 0;
	const commit = get("ask-commit");
	const delivery = Object.values(get("commit") ?? {})[0];
	const lines = [
		`Task ${task.taskName} (Feature ${task.featureId})`,
		`Worktree: ${worktree?.path ?? "none"} on ${worktree?.branch ?? "none"}`,
		`Preflight: ${get("preflight")?.pass ? "four PASS" : "not passed"}`,
		`Failing tests first: ${get("tests-check")?.count ?? 0}`,
		`Chunks implemented: ${chunks}`,
		`Checks: ${get("checks")?.check?.pass ?? get("recheck")?.check?.pass ? "style and tests pass" : "see the journal"}`,
		`Code paths: ${get("scope-gate")?.count ?? "?"}`,
		`Task review: ${get("review-gate")?.blocking === 0 ? "no blocking finding" : "blocking findings left"}`,
		`Delivery: ${delivery ? `committed, PR ${delivery.fields[1] ?? "?"}` : commit?.answer === "no" ? "not committed (you answered no)" : "not reached"}`
	];
	appendJournal(task.taskFile, `run report: ${lines.slice(1).join("; ")}`);
	return {
		state: { text: lines.join("\n") },
		metrics: { chunks },
		output: lines.join("\n")
	};
};
var IMPL_OPERATIONS = {
	"impl.task": implTask,
	"impl.worktree": implWorktree,
	"impl.journal": implJournal,
	"impl.preflight": implPreflight,
	"impl.stacks": implStacks,
	"impl.testsFirst": implTestsFirst,
	"impl.chunkPlan": implChunkPlan,
	"impl.childCheck": implChildCheck,
	"impl.dispute": implDispute,
	"impl.checks": implChecks,
	"impl.docker": implDocker,
	"impl.contextFiles": implContextFiles,
	"impl.scopeGate": implScopeGate,
	"impl.reviewGate": implReviewGate,
	"impl.stop": implStop,
	"impl.openEditor": implOpenEditor,
	"impl.report": implReport
};
var IMPL_PARSERS = {
	"impl.preflight": parseLine("preflight"),
	"impl.tests": parseLine("tests"),
	"impl.chunks": parseChunks,
	"impl.chunk": parseLine("chunk"),
	"impl.dispute": parseLine("dispute"),
	"impl.style": parseLine("style"),
	"impl.docker": parseLine("docker"),
	"impl.runtime": parseLine("runtime"),
	"impl.delivery": parseLine("delivery")
};
// src/ops.ts
var TIERS = [
	"bug",
	"security",
	"repo-rule",
	"design",
	"style",
	"nit"
];
function stateOf(state, key) {
	const value = state[key];
	if (value === void 0) throw new Error(`state.${key} is not set`);
	return value;
}
function stringList(value, name) {
	if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) throw new Error(`${name} must be a list of strings`);
	return value;
}
function splitDiff(diff) {
	const files = [];
	for (const chunk of diff.split(/^(?=diff --git )/m)) {
		const header = chunk.match(/^diff --git a\/(.+?) b\/(.+)$/m);
		if (header?.[2] !== void 0) files.push({
			path: header[2],
			diff: chunk
		});
	}
	return files;
}
function cleanLine(line) {
	const bare = line.trim().replace(/^[-*]\s+/, "");
	return /^`[^`]*`$/.test(bare) ? bare.slice(1, -1) : bare;
}
function parseFindings(text) {
	return String(text).split("\n").map(cleanLine).filter((line) => line.split("|").length >= 5 && !/^path\s*\|/i.test(line)).map((line) => {
		const [location = "", ruleId = "", sev = "", problem = "", ...fix] = line.split("|").map((p) => p.trim());
		return {
			location,
			ruleId,
			sev,
			problem,
			fix: fix.join(" | "),
			line
		};
	});
}
function parseVerdicts(text) {
	const verdicts = [];
	for (const line of String(text).split("\n").map(cleanLine)) {
		const match = line.match(/^(CONFIRMED-UNCHECKED|CONFIRMED|REJECTED)\s*\|\s*(.+)$/);
		if (match?.[1] !== void 0 && match[2] !== void 0) verdicts.push({
			verdict: match[1],
			rest: match[2]
		});
	}
	return verdicts;
}
function tierOf$1(finding) {
	const rule = finding.ruleId;
	const skillPrefix = (name) => new RegExp(`^${name}[.:]`).test(rule);
	if (finding.sev === "nit") return "nit";
	if (rule.startsWith("bug.")) return "bug";
	if (rule.startsWith("sec.") || /-security[.:]/.test(rule)) return "security";
	if (rule.startsWith("repo.") || /-testing[.:]/.test(rule)) return "repo-rule";
	if (skillPrefix("olko-design-rules") || /-architecture[.:]/.test(rule)) return "design";
	return "style";
}
var pass = async () => ({
	state: { passed: true },
	output: "verify passed"
});
var reviewRoute = async ({ input, exec }) => {
	if (input.plan) return {
		state: {
			route: "PLAN",
			review: false
		},
		output: `PLAN (${input.plan})`
	};
	if (input.base) return {
		state: {
			route: "LOCAL",
			review: true
		},
		output: `LOCAL (working tree against ${input.base})`
	};
	if (!exec) throw new Error("review.route needs the host exec tool");
	if (input.pr === void 0 || !input.repo) throw new Error("review.route needs repo and pr, or plan, in the input");
	const view = await exec("gh", [
		"pr",
		"view",
		String(input.pr),
		"--repo",
		input.repo,
		"--json",
		"author"
	]);
	const user = await exec("gh", [
		"api",
		"user",
		"--jq",
		".login"
	]);
	if (view.code !== 0 || user.code !== 0) throw new Error(`gh failed: ${(view.stderr || user.stderr).slice(-300)}`);
	const author = JSON.parse(view.stdout).author.login;
	const own = author === user.stdout.trim();
	if (own && !input.fresh) return {
		state: {
			route: "FEEDBACK",
			review: false,
			own
		},
		output: "FEEDBACK (the PR author is the signed-in user)"
	};
	const reason = own ? "fresh review of own PR" : `PR by ${author}`;
	return {
		state: {
			route: "REVIEW",
			review: true,
			own
		},
		output: `REVIEW (${reason})`
	};
};
function untrackedDiff(file, text) {
	const lines = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
	return `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join("\n")}\n`;
}
async function localDiff(exec, root, base) {
	if (!/^[\w./-]+$/.test(base)) throw new Error(`base ${base} is not a git ref`);
	const mergeBase = await exec("git", [
		"-C",
		root,
		"merge-base",
		base,
		"HEAD"
	]);
	if (mergeBase.code !== 0) throw new Error(`git merge-base ${base} HEAD failed: ${mergeBase.stderr.slice(-300)}`);
	const tracked = await exec("git", [
		"-C",
		root,
		"diff",
		mergeBase.stdout.trim()
	]);
	const untracked = await exec("git", [
		"-C",
		root,
		"ls-files",
		"--others",
		"--exclude-standard"
	]);
	if (tracked.code !== 0 || untracked.code !== 0) throw new Error(`git diff failed: ${(tracked.stderr || untracked.stderr).slice(-300)}`);
	const added = untracked.stdout.split(/\r?\n/).filter(Boolean).map((f) => untrackedDiff(f, fs.readFileSync(path.join(root, f), "utf8")));
	return {
		files: splitDiff(tracked.stdout + added.join("")),
		added: added.length,
		mergeBase: mergeBase.stdout.trim()
	};
}
async function localScope(input, exec, exclude, root) {
	const base = String(input.base);
	const diff = await localDiff(exec, root, base);
	const isExcluded = (p) => exclude.some((re) => re.test(p));
	const files = diff.files.filter((f) => !isExcluded(f.path));
	const excluded = diff.files.filter((f) => isExcluded(f.path)).map((f) => f.path);
	if (files.length === 0) throw new Error(`no local change against ${base} to review`);
	return {
		state: {
			base,
			repo: "",
			title: `local changes against ${base}`,
			body: (input.criteria ?? "").trim(),
			head: "working tree",
			files,
			excluded,
			stale: false
		},
		metrics: {
			files: files.length,
			excluded: excluded.length,
			stale: 0
		},
		output: `Local diff against ${base}: ${files.length} files (${diff.added} new). Not sent to lenses: ${excluded.join(", ") || "none"}.`
	};
}
var prScope = async ({ input, exec, args, cwd }) => {
	if (input.base) {
		if (!exec) throw new Error("github.prScope needs the host exec tool");
		return localScope(input, exec, stringList(args.exclude ?? [], "with.exclude").map((p) => new RegExp(p)), path.resolve(cwd ?? "."));
	}
	const pr = input.pr;
	const repo = input.repo ?? "";
	if (pr === void 0 || !Number.isInteger(pr) || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("input needs repo owner/name and an integer pr");
	if (!exec) throw new Error("github.prScope needs the host exec tool");
	const exclude = stringList(args.exclude ?? [], "with.exclude").map((p) => new RegExp(p));
	const view = await exec("gh", [
		"pr",
		"view",
		String(pr),
		"--repo",
		repo,
		"--json",
		"title,body,headRefName,author"
	]);
	const diff = await exec("gh", [
		"pr",
		"diff",
		String(pr),
		"--repo",
		repo
	]);
	if (view.code !== 0 || diff.code !== 0) throw new Error(`gh failed: ${(view.stderr || diff.stderr).slice(-300)}`);
	const branch = await exec("git", [
		"-C",
		cwd ?? ".",
		"branch",
		"--show-current"
	]);
	const meta = JSON.parse(view.stdout);
	const all = splitDiff(diff.stdout);
	const isExcluded = (p) => exclude.some((re) => re.test(p));
	const files = all.filter((f) => !isExcluded(f.path));
	const excluded = all.filter((f) => isExcluded(f.path)).map((f) => f.path);
	if (files.length === 0) throw new Error("no diff to review");
	const stale = branch.code !== 0 || branch.stdout.trim() !== meta.headRefName;
	return {
		state: {
			pr,
			repo,
			title: meta.title,
			body: meta.body || "",
			head: meta.headRefName,
			files,
			excluded,
			stale
		},
		metrics: {
			files: files.length,
			excluded: excluded.length,
			stale: stale ? 1 : 0
		},
		output: `PR #${pr} "${meta.title}" (${meta.headRefName}): ${files.length} files, ${diff.stdout.length} characters of diff. Not sent to lenses: ${excluded.join(", ") || "none"}. Working tree ${stale ? "is not the PR head: lenses judge changed lines from the hunks only" : "is the PR head"}.`
	};
};
var detectLenses = async ({ state, args }) => {
	const scope = stateOf(state, "scope");
	const files = scope.files;
	const always = args.always;
	const stacks = args.stacks ?? [];
	const requirements = args.requirements;
	if (!always?.id || !always.agent) throw new Error("with.always needs id and agent");
	const lenses = [{
		id: always.id,
		agentName: always.agent,
		role: "lens",
		paths: files.map((f) => f.path),
		files
	}];
	for (const stack of stacks) {
		const extensions = stringList(stack.extensions ?? [], `with.stacks.${stack.id}.extensions`);
		const matched = files.filter((f) => extensions.some((ext) => f.path.endsWith(ext)));
		if (matched.length) lenses.push({
			id: stack.id,
			agentName: stack.agent,
			role: "lens",
			paths: matched.map((f) => f.path),
			files: matched
		});
	}
	const covered = new Set(lenses.slice(1).flatMap((l) => l.paths ?? []));
	const onlyAlways = [...new Set(files.map((f) => f.path).filter((p) => !covered.has(p)).map((p) => p.match(/\.[^./]+$/)?.[0] ?? "(no extension)"))];
	const criteria = scope.body.trim();
	if (requirements?.id && requirements.agent && criteria) lenses.push({
		id: requirements.id,
		agentName: requirements.agent,
		role: "lens",
		paths: files.map((f) => f.path),
		files,
		criteria,
		mode: "code"
	});
	return {
		state: {
			lenses,
			bugsOnlyTypes: onlyAlways,
			criteria: criteria ? "PR description" : "none"
		},
		metrics: { lenses: lenses.length },
		output: `Lenses: ${lenses.map((l) => `${l.agentName} (${l.paths?.length} files)`).join(", ")}. File types reviewed only by ${always.agent}: ${onlyAlways.join(", ") || "none"}. Acceptance criteria: ${criteria ? "PR description" : "none, requirements lens skipped"}.`
	};
};
function memoryLists(text) {
	const counts = /* @__PURE__ */ new Map();
	for (const line of text.split(/\r?\n/)) {
		const match = line.trim().replace(/^[-*]\s+/, "").match(/^(confirmed|rejected):(\S+)/);
		if (!match?.[1] || !match[2]) continue;
		const entry = counts.get(match[2]) ?? {
			confirmed: 0,
			rejected: 0
		};
		entry[match[1]] += 1;
		counts.set(match[2], entry);
	}
	return {
		suppress: [...counts].filter(([, c]) => c.rejected >= 2).map(([p]) => p),
		prioritize: [...counts].filter(([, c]) => c.confirmed >= 1).map(([p]) => p)
	};
}
function memoryFile(cwd, agent) {
	if (typeof agent !== "string" || !/^[a-z0-9-]+$/.test(agent)) throw new Error("with.agent must name the agent that owns the memory block");
	return path.join(cwd ?? process.cwd(), ".opencode", "memory", `${agent}.md`);
}
var memoryLoad = async ({ args, cwd }) => {
	const file = memoryFile(cwd, args.agent);
	if (!fs.existsSync(file)) return {
		state: {
			loaded: false,
			file,
			suppressText: "none",
			prioritizeText: "none"
		},
		metrics: {
			loaded: 0,
			suppress: 0,
			prioritize: 0
		},
		output: `Memory block ${file} does not exist.`
	};
	const { suppress, prioritize } = memoryLists(fs.readFileSync(file, "utf8"));
	return {
		state: {
			loaded: true,
			file,
			suppress,
			prioritize,
			suppressText: suppress.join(", ") || "none",
			prioritizeText: prioritize.join(", ") || "none"
		},
		metrics: {
			loaded: 1,
			suppress: suppress.length,
			prioritize: prioritize.length
		},
		output: `Memory loaded from ${file}: ${suppress.length} suppressed, ${prioritize.length} prioritized patterns.`
	};
};
function nodeArg(args, key, fallback) {
	const value = args[key] ?? fallback;
	if (typeof value !== "string") throw new Error(`with.${key} must name a node`);
	return value;
}
var mergeFindings = async ({ state, args }) => {
	const byKey = /* @__PURE__ */ new Map();
	const lensResults = state[nodeArg(args, "from", "lenses")] ?? {};
	for (const [lens, findings] of Object.entries(lensResults)) for (const f of findings) {
		const key = `${f.location}|${f.ruleId}`;
		const current = byKey.get(key);
		if (!current || TIERS.indexOf(tierOf$1(f)) < TIERS.indexOf(tierOf$1(current))) byKey.set(key, {
			...f,
			lens
		});
	}
	const findings = [...byKey.values()];
	return {
		state: { findings },
		metrics: { findings: findings.length },
		output: findings.length ? findings.map((f) => f.line).join("\n") : "No findings from the lenses."
	};
};
var confirmFindings = async ({ state, args }) => {
	const findings = stateOf(state, nodeArg(args, "findings", "merge")).findings;
	const verifyNode = nodeArg(args, "verdicts", "verify");
	const verdicts = state[verifyNode]?.[verifyNode] ?? [];
	const confirmed = [];
	const dropped = [];
	findings.forEach((f, i) => {
		const v = verdicts[i];
		if (v && v.verdict !== "REJECTED") confirmed.push({
			...f,
			unchecked: v.verdict === "CONFIRMED-UNCHECKED"
		});
		else dropped.push({
			...f,
			reason: v ? (v.rest.split("|").at(-1) ?? "").trim() : "no verdict returned"
		});
	});
	return {
		state: {
			confirmed,
			dropped,
			count: confirmed.length
		},
		metrics: {
			confirmed: confirmed.length,
			dropped: dropped.length
		},
		output: `${confirmed.length} confirmed, ${dropped.length} dropped by the verifier.`
	};
};
function parseRulesCheck(text) {
	const lines = String(text).split("\n").map(cleanLine).filter(Boolean);
	const result = {
		noStore: lines.some((l) => /^no-store$/i.test(l)),
		violations: [],
		verdicts: []
	};
	for (const line of lines) {
		if (/^violation\s*\|/.test(line)) result.violations.push(line.replace(/^violation\s*\|\s*/, ""));
		const verdict = line.match(/^(keep|drop|ask)\s*\|\s*(.+)\|\s*([^|]+)$/);
		if (verdict?.[1] && verdict[2] && verdict[3]) result.verdicts.push({
			verdict: verdict[1],
			finding: verdict[2].trim(),
			cite: verdict[3].trim()
		});
	}
	return result;
}
var mergeRules = async ({ state, args }) => {
	const confirmed = stateOf(state, nodeArg(args, "confirmed", "confirm")).confirmed;
	const check = Object.values(state[nodeArg(args, "check", "rules-check")] ?? {})[0];
	if (!check) throw new Error("rules-check returned nothing");
	if (check.noStore) return {
		state: {
			kept: confirmed,
			dropped: [],
			decide: [],
			violations: [],
			noStore: true
		},
		metrics: {
			noStore: 1,
			decide: 0,
			violations: 0,
			dropped: 0
		},
		output: "Project rules check: no-store (no ADR or rule directory). Skipped."
	};
	const kept = [];
	const dropped = [];
	const decide = [];
	confirmed.forEach((f, i) => {
		const v = check.verdicts[i];
		if (v?.verdict === "drop") dropped.push({
			line: f.line,
			cite: v.cite
		});
		else if (v?.verdict === "ask") decide.push({
			kind: "ask",
			line: f.line,
			cite: v.cite
		});
		else kept.push(f);
	});
	return {
		state: {
			kept,
			dropped,
			decide,
			violations: check.violations,
			noStore: false
		},
		metrics: {
			noStore: 0,
			decide: decide.length,
			violations: check.violations.length,
			dropped: dropped.length
		},
		output: `Project rules check: ${check.violations.length} violations, ${dropped.length} findings dropped by the store, ${decide.length} to decide.`
	};
};
var addViolations = async ({ state, args }) => {
	const rules = stateOf(state, nodeArg(args, "rules", "rules-merge"));
	const verifyNode = nodeArg(args, "verdicts", "verify-violations");
	const verdicts = state[verifyNode]?.[verifyNode] ?? [];
	const confirmed = rules.violations.filter((_, i) => verdicts[i] && verdicts[i].verdict !== "REJECTED");
	const decide = [...rules.decide, ...confirmed.map((line) => ({
		kind: "violation",
		line,
		cite: line.split("|").slice(-2).join("|").trim()
	}))];
	return {
		state: { decide },
		metrics: {
			decide: decide.length,
			violations: confirmed.length
		},
		output: `${confirmed.length} store violations confirmed by the verifier.`
	};
};
var listNext = async ({ state, args, nodeId }) => {
	if (typeof args.over !== "string") throw new Error("with.over must be a state path");
	const list = args.over.split(".").reduce((value, key) => value && typeof value === "object" ? value[key] : void 0, state);
	if (!Array.isArray(list)) throw new Error(`state.${args.over} is not a list`);
	const previous = nodeId ? state[nodeId] : void 0;
	const index = previous?.index === void 0 || previous.done ? 0 : previous.index + 1;
	const done = index >= list.length;
	return {
		state: {
			index,
			number: index + 1,
			total: list.length,
			item: done ? null : list[index],
			done
		},
		metrics: {
			index,
			total: list.length
		},
		output: done ? `All ${list.length} items handled.` : `Item ${index + 1} of ${list.length}.`
	};
};
var rankFindings = async ({ state, answers }) => {
	const scope = stateOf(state, "scope");
	const detect = stateOf(state, "detect");
	const confirm = stateOf(state, "confirm");
	const rules = stateOf(state, "rules-merge");
	const decide = state["rules-violations"]?.decide ?? state["rules-merge"].decide;
	const memory = state.memory;
	const decided = decide.map((d, i) => ({
		...d,
		answer: answers?.[`q-rule-${i}`] ?? "unanswered"
	}));
	const kept = [...rules.kept];
	for (const d of decided) if (d.answer !== "store") kept.push({
		location: d.line.split("|")[0]?.trim() ?? "",
		ruleId: d.kind === "violation" ? "repo.store" : "repo.ask",
		sev: "bug",
		problem: d.line,
		fix: "",
		line: d.line,
		unchecked: false
	});
	kept.sort((a, b) => TIERS.indexOf(tierOf$1(a)) - TIERS.indexOf(tierOf$1(b)));
	const totals = TIERS.map((t) => `${t}: ${kept.filter((f) => tierOf$1(f) === t).length}`).join(", ");
	const lines = [
		scope.pr === void 0 ? `Review of ${scope.title}` : `Review of PR #${scope.pr}: ${scope.title}`,
		"",
		...kept.length ? kept.map((f) => `${f.line}${f.unchecked ? " (rule unchecked)" : ""}`) : ["No confirmed findings."],
		"",
		`Totals: ${totals}`,
		`Lenses run: ${detect.lenses.map((l) => l.agentName).join(", ")}`,
		`Acceptance criteria: ${detect.criteria}`,
		`File types reviewed only by the always-on lens: ${detect.bugsOnlyTypes.join(", ") || "none"}`,
		`Not reviewed (excluded): ${scope.excluded.join(", ") || "none"}`,
		`Dropped by the verifier: ${confirm.dropped.length}`,
		...confirm.dropped.map((f) => `  - ${f.line} | ${f.reason}`),
		`Project rules check: ${rules.noStore ? "no-store, skipped" : `${rules.dropped.length} dropped by the store`}`,
		...rules.dropped.map((d) => `  - ${d.line} | ${d.cite}`),
		...decided.map((d) => `Decided (${d.kind}): ${d.line} -> ${d.answer === "store" ? "store entry holds" : "finding holds"}`),
		`Memory: ${memory?.loaded ? "loaded" : "not loaded (the user chose to continue without it)"}`
	];
	return {
		state: {
			kept,
			count: kept.length
		},
		metrics: { kept: kept.length },
		output: lines.join("\n")
	};
};
var postComment = async ({ state, exec, args }) => {
	if (!exec) throw new Error("github.postComment needs the host exec tool");
	if (typeof args.from !== "string") throw new Error("with.from must name the list node");
	const scope = stateOf(state, "scope");
	const item = state[args.from]?.item;
	if (!item) throw new Error(`state.${args.from}.item is not set`);
	const result = await exec("gh", [
		"pr",
		"comment",
		String(scope.pr),
		"--repo",
		scope.repo,
		"--body",
		item.line
	]);
	if (result.code !== 0) throw new Error(`gh pr comment failed: ${result.stderr.slice(-300)}`);
	return {
		state: { posted: item.line },
		metrics: { posted: 1 },
		output: `Posted on PR #${scope.pr}: ${item.line}`
	};
};
function memoryDecisionLines(kept, answers, prefix) {
	return kept.flatMap((f, i) => {
		const answer = answers[`${prefix}${i}`];
		if (answer === "post") return [`confirmed:${f.ruleId}`];
		if (answer === "skip") return [`rejected:${f.ruleId}`];
		return [];
	});
}
var memoryPersist = async ({ state, answers, args }) => {
	const memory = state.memory;
	if (!memory?.loaded || !memory.file) return {
		state: { written: 0 },
		metrics: { written: 0 },
		output: "Learning skipped: the memory block was not loaded."
	};
	const kept = stateOf(state, "rank").kept;
	const lines = memoryDecisionLines(kept, answers ?? {}, typeof args.questionPrefix === "string" ? args.questionPrefix : "q-post-");
	if (lines.length) fs.appendFileSync(memory.file, `${lines.join("\n")}\n`);
	return {
		state: { written: lines.length },
		metrics: { written: lines.length },
		output: lines.length ? `Memory: ${lines.length} decisions recorded in ${memory.file}.` : "Memory: nothing durable happened."
	};
};
var planRead = async ({ input, cwd }) => {
	const root = path.resolve(cwd ?? process.cwd());
	const file = path.resolve(root, input.plan ?? "");
	if (!input.plan || file !== root && !file.startsWith(root + path.sep)) throw new Error("input.plan must be a file inside the workspace");
	if (!fs.existsSync(file)) throw new Error(`plan file ${input.plan} does not exist in ${root}`);
	const text = fs.readFileSync(file, "utf8");
	const criteria = (input.criteria ?? "").trim();
	return {
		state: {
			path: input.plan,
			text,
			criteria: criteria || "none"
		},
		metrics: {
			characters: text.length,
			criteria: criteria ? 1 : 0
		},
		output: `Plan ${input.plan}: ${text.length} characters. Acceptance criteria: ${criteria ? "given" : "none (design rules only)"}.`
	};
};
function decisions(state, answers, violationsNode, rulesNode, prefix) {
	return (state[violationsNode]?.decide ?? state[rulesNode]?.decide ?? []).map((d, i) => ({
		...d,
		answer: answers?.[`${prefix}${i}`] ?? "unanswered"
	}));
}
var planReport = async ({ state, answers }) => {
	const plan = stateOf(state, "plan-read");
	const confirm = stateOf(state, "plan-confirm");
	const rules = stateOf(state, "plan-rules-merge");
	const asPlanLine = (line) => line.startsWith("plan:") ? line : `plan: ${line}`;
	const lines = [
		`Plan review of ${plan.path}`,
		"",
		...rules.kept.length ? rules.kept.map((f) => `${asPlanLine(f.line)}${f.unchecked ? " (rule unchecked)" : ""}`) : ["No confirmed findings."],
		"",
		`Totals: ${TIERS.map((t) => `${t}: ${rules.kept.filter((f) => tierOf$1(f) === t).length}`).join(", ")}`,
		`Acceptance criteria: ${plan.criteria === "none" ? "none, design rules only" : "given"}`,
		`Dropped by the verifier: ${confirm.dropped.length}`,
		...confirm.dropped.map((f) => `  - ${f.line} | ${f.reason}`),
		`Project rules check: ${rules.noStore ? "no-store, skipped" : `${rules.dropped.length} dropped by the store`}`,
		...rules.dropped.map((d) => `  - ${d.line} | ${d.cite}`),
		...decisions(state, answers, "plan-rules-violations", "plan-rules-merge", "q-plan-rule-").map((d) => `Decided (${d.kind}): ${d.line} -> ${d.answer === "store" ? "store entry holds" : d.answer === "finding" ? "finding holds" : "not decided"}`)
	];
	return {
		state: {
			kept: rules.kept,
			count: rules.kept.length
		},
		metrics: { kept: rules.kept.length },
		output: lines.join("\n")
	};
};
function groupComments(comments, nearbyLines = 3) {
	const items = [];
	for (const comment of comments) {
		const near = comment.path ? items.find((i) => i.path === comment.path && i.line !== null && comment.line !== null && Math.abs(i.line - comment.line) <= nearbyLines) : void 0;
		if (near) near.comments.push(comment);
		else items.push({
			index: items.length,
			path: comment.path,
			line: comment.line,
			comments: [comment]
		});
	}
	return items;
}
var prFeedback = async ({ input, exec, cwd }) => {
	if (!exec) throw new Error("github.prFeedback needs the host exec tool");
	const repo = input.repo ?? "";
	const [owner, name] = repo.split("/");
	if (!owner || !name || input.pr === void 0) throw new Error("github.prFeedback needs repo and pr");
	const view = await exec("gh", [
		"pr",
		"view",
		String(input.pr),
		"--repo",
		repo,
		"--json",
		"headRefName,author,comments"
	]);
	if (view.code !== 0) throw new Error(`gh pr view failed: ${view.stderr.slice(-300)}`);
	const meta = JSON.parse(view.stdout);
	const branch = await exec("git", [
		"-C",
		cwd ?? ".",
		"branch",
		"--show-current"
	]);
	if (branch.code !== 0 || branch.stdout.trim() !== meta.headRefName) throw new Error(`the local branch (${branch.stdout.trim() || "unknown"}) is not the PR head branch ${meta.headRefName}: check out ${meta.headRefName} first`);
	const checks = await exec("gh", [
		"pr",
		"checks",
		String(input.pr),
		"--repo",
		repo,
		"--json",
		"name,state"
	]);
	const checkList = checks.code === 0 && checks.stdout.trim() ? JSON.parse(checks.stdout) : [];
	const threads = await exec("gh", [
		"api",
		"graphql",
		"-f",
		`query=${`query { repository(owner: "${owner}", name: "${name}") { pullRequest(number: ${input.pr}) { reviewThreads(first: 100) { nodes { id isResolved isOutdated comments(first: 1) { nodes { author { login } path line body url } } } } } } }`}`
	]);
	if (threads.code !== 0) throw new Error(`gh api graphql failed: ${threads.stderr.slice(-300)}`);
	const comments = [...JSON.parse(threads.stdout).data.repository.pullRequest.reviewThreads.nodes.filter((t) => !t.isResolved && !t.isOutdated && t.comments.nodes[0]).map((t) => {
		const c = t.comments.nodes[0];
		return {
			id: t.id,
			kind: "thread",
			author: c.author?.login ?? "unknown",
			path: c.path,
			line: c.line,
			body: c.body,
			url: c.url
		};
	}), ...meta.comments.filter((c) => c.author?.login !== meta.author.login).map((c) => ({
		id: c.id,
		kind: "comment",
		author: c.author?.login ?? "unknown",
		path: null,
		line: null,
		body: c.body,
		url: c.url
	}))];
	const items = groupComments(comments);
	const ci = checkList.length ? checkList.map((c) => `${c.name}: ${c.state}`).join(", ") : "no checks";
	return {
		state: {
			head: meta.headRefName,
			checks: checkList,
			ci,
			comments,
			items
		},
		metrics: {
			checks: checkList.length,
			comments: comments.length,
			items: items.length
		},
		output: `CI: ${ci}. Unresolved comments: ${comments.length} in ${items.length} items.`
	};
};
var feedbackPlan = async ({ state, answers }) => {
	const decided = stateOf(state, "fb-check").items.map((item) => ({
		...item,
		decision: answers?.[`q-feedback-${item.index}`] ?? "skip"
	}));
	const count = (d) => decided.filter((i) => i.decision === d).length;
	const replies = decided.filter((i) => i.decision === "wont-fix" || i.decision === "question");
	return {
		state: {
			decided,
			replies,
			fixes: count("fix")
		},
		metrics: {
			fixes: count("fix"),
			wontFix: count("wont-fix"),
			questions: count("question"),
			skipped: count("skip"),
			replies: replies.length
		},
		output: `Plan: ${count("fix")} fix, ${count("wont-fix")} won't fix, ${count("question")} question, ${count("skip")} skipped.`
	};
};
var postReply = async ({ state, exec, input, args }) => {
	if (!exec) throw new Error("github.postReply needs the host exec tool");
	const from = nodeArg(args, "from", "fb-reply-next");
	const draftNode = nodeArg(args, "draft", "fb-draft");
	const item = state[from]?.item;
	const draft = Object.values(state[draftNode] ?? {})[0];
	if (!item || !draft) throw new Error("no reply to post");
	const first = item.comments[0];
	const result = first.kind === "thread" ? await exec("gh", [
		"api",
		"graphql",
		"-f",
		`query=mutation { addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: "${first.id}", body: ${JSON.stringify(draft)} }) { comment { url } } }`
	]) : await exec("gh", [
		"pr",
		"comment",
		String(input.pr),
		"--repo",
		input.repo ?? "",
		"--body",
		draft
	]);
	if (result.code !== 0) throw new Error(`posting the reply failed: ${result.stderr.slice(-300)}`);
	return {
		state: { posted: first.url },
		metrics: { posted: 1 },
		output: `Reply posted to ${first.url}`
	};
};
var feedbackReport = async ({ state, answers }) => {
	const check = stateOf(state, "fb-check");
	const plan = stateOf(state, "fb-plan");
	const implement = answers?.["q-feedback-implement"];
	return {
		state: { done: true },
		output: [
			`CI: ${check.ci}`,
			`Unresolved comments: ${check.comments.length}`,
			...plan.decided.map((i) => `  - ${i.path ?? "PR"}${i.line ? `:${i.line}` : ""} (${i.comments.length} comments): ${i.decision}`),
			`Implementation: ${implement === "yes" ? "approved" : implement === "no" ? "declined" : "nothing to implement"}`
		].join("\n")
	};
};
var MARKETPLACE_FALLBACK = "C:\\Users\\Inny\\Documents\\Git\\marketplace";
var SEMVER_LINE = /^version:\s*["']?(\d+\.\d+\.\d+)["']?\s*$/m;
var CLASSIFICATIONS = [
	"identical",
	"local-only",
	"marketplace-only",
	"project-adapter-only",
	"adapter-candidate",
	"portable-local-change",
	"conflict"
];
var ADOPT = [
	"adopt-patch",
	"adopt-minor",
	"adopt-major"
];
function readJson$1(file) {
	return JSON.parse(fs.readFileSync(file, "utf8"));
}
function marketplaceRoot(state) {
	return stateOf(state, "resolve-path").path;
}
var resolveMarketplacePath = async ({ input, exec, cwd }) => {
	if (!exec) throw new Error("sync.resolvePath needs the host exec tool");
	const adapterFile = path.join(cwd ?? ".", ".opencode", "marketplace-path.local.json");
	const adapter = fs.existsSync(adapterFile) ? readJson$1(adapterFile).marketplacePath : void 0;
	const [source, target] = input.marketplace ? ["input", input.marketplace] : process.env.MARKETPLACE_PATH ? ["MARKETPLACE_PATH", process.env.MARKETPLACE_PATH] : adapter ? ["project adapter", adapter] : ["fallback", MARKETPLACE_FALLBACK];
	if (!fs.existsSync(path.resolve(target))) throw new Error(`marketplace path ${path.resolve(target)} (${source}) does not exist`);
	const resolved = fs.realpathSync.native(path.resolve(target));
	const repo = await exec("git", [
		"-C",
		resolved,
		"rev-parse",
		"--is-inside-work-tree"
	]);
	if (repo.code !== 0 || repo.stdout.trim() !== "true") throw new Error(`marketplace path ${resolved} (${source}) is not a Git repository`);
	return {
		state: {
			path: resolved,
			source,
			fallback: source === "fallback"
		},
		metrics: { fallback: source === "fallback" ? 1 : 0 },
		output: `Marketplace (${source}): ${resolved}`
	};
};
var safeSource = async ({ state, exec, answers, args, input }) => {
	if (!exec) throw new Error("sync.safeSource needs the host exec tool");
	const root = typeof args.path === "string" ? String(args.path.split(".").reduce((v, k) => v && typeof v === "object" ? v[k] : void 0, state) ?? "") : input.path ?? marketplaceRoot(state);
	if (!root) throw new Error(`with.path ${String(args.path)} is not set in state`);
	const switchQuestion = typeof args.question === "string" ? args.question : "q-marketplace-main";
	const git = (...args) => exec("git", [
		"-C",
		root,
		...args
	]);
	const label = input.label ?? "Marketplace";
	const stop = (reason, detail, clean) => ({
		state: {
			ok: false,
			reason,
			detail
		},
		metrics: {
			clean,
			ok: 0
		},
		output: `${label} not safe: ${detail}`
	});
	const status = await git("status", "--porcelain");
	if (status.code !== 0) return stop("status", status.stderr.trim(), 0);
	if (status.stdout.trim()) return stop("dirty", `the worktree of ${root} has local changes`, 0);
	let branch = (await git("branch", "--show-current")).stdout.trim();
	if (branch !== "main") {
		if (answers?.[switchQuestion] !== "switch") return {
			state: {
				ok: false,
				reason: "not-main",
				detail: branch || "detached HEAD",
				branch
			},
			metrics: {
				clean: 1,
				ok: 0
			},
			output: `Marketplace is on ${branch || "a detached HEAD"}, not main.`
		};
		const checkout = await git("checkout", "main");
		if (checkout.code !== 0) return stop("checkout", checkout.stderr.trim(), 1);
		branch = "main";
	}
	if ((await git("remote", "get-url", "origin")).code !== 0) return stop("no-remote", `${root} has no origin remote`, 1);
	const fetch = await git("fetch", "origin", "main");
	if (fetch.code !== 0) return stop("fetch", fetch.stderr.trim(), 1);
	const pull = await git("pull", "--ff-only", "origin", "main");
	if (pull.code !== 0) return stop("pull", pull.stderr.trim(), 1);
	const head = (await git("rev-parse", "HEAD")).stdout.trim();
	return {
		state: {
			ok: true,
			reason: "ok",
			branch,
			head
		},
		metrics: {
			clean: 1,
			ok: 1
		},
		output: `Marketplace ${root} is clean on main at ${head.slice(0, 12)}, fast-forwarded to origin/main.`
	};
};
function frontmatterVersion(file) {
	return fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").match(SEMVER_LINE)?.[1] ?? "none" : "none";
}
function skillDirIn(root, name) {
	const skills = path.join(root, "skills");
	if (!fs.existsSync(skills)) return void 0;
	return fs.readdirSync(skills).map((c) => path.join(skills, c, name)).find((d) => fs.existsSync(path.join(d, "SKILL.md")));
}
function manifestVersion(file, key, name) {
	if (!fs.existsSync(file)) return "none";
	return (readJson$1(file)[key]?.find((e) => e.name === name))?.version ?? "none";
}
var discoverArtifacts = async ({ input, state, cwd }) => {
	const project = path.resolve(cwd ?? ".");
	const root = marketplaceRoot(state);
	const skillsDir = path.join(project, ".agents", "skills");
	const agentsDir = path.join(project, ".opencode", "agents");
	const localSkills = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir).filter((n) => fs.existsSync(path.join(skillsDir, n, "SKILL.md"))) : [];
	const localAgents = fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)) : [];
	const wanted = input.artifacts;
	if (wanted) {
		const missing = wanted.filter((n) => !localSkills.includes(n) && !localAgents.includes(n));
		if (missing.length) throw new Error(`input.artifacts not found in ${project}: ${missing.join(", ")}`);
	}
	const pick = (names) => wanted ? names.filter((n) => wanted.includes(n)) : names;
	const skills = pick(localSkills).map((name) => {
		const dir = skillDirIn(root, name);
		return {
			id: name,
			type: "skill",
			name,
			localPath: path.join(skillsDir, name),
			marketplacePath: dir ?? "none",
			manifestPath: path.join(root, "registry.json"),
			marketplaceVersion: manifestVersion(path.join(root, "registry.json"), "skills", name),
			localVersion: frontmatterVersion(path.join(skillsDir, name, "SKILL.md"))
		};
	});
	const agents = pick(localAgents).map((name) => {
		const file = path.join(root, "agents", "opencode", `${name}.md`);
		return {
			id: name,
			type: "agent",
			name,
			localPath: path.join(agentsDir, `${name}.md`),
			marketplacePath: fs.existsSync(file) ? file : "none",
			manifestPath: path.join(root, "agents", "opencode", "index.json"),
			marketplaceVersion: manifestVersion(path.join(root, "agents", "opencode", "index.json"), "agents", name),
			localVersion: manifestVersion(path.join(agentsDir, "index.json"), "agents", name)
		};
	});
	const compare = [...skills, ...agents];
	return {
		state: {
			project,
			skills,
			agents,
			compare
		},
		metrics: {
			artifacts: compare.length,
			skills: skills.length,
			agents: agents.length
		},
		output: `Discovered ${skills.length} local skills and ${agents.length} local agents to compare in ${project}.`
	};
};
var checkSkillVersions = async ({ state }) => {
	const skills = stateOf(state, "discover").skills;
	const missing = skills.filter((s) => frontmatterVersion(path.join(s.localPath, "SKILL.md")) === "none").map((s) => s.name);
	if (missing.length) throw new Error(`olko-adapt-to-marketplace --local-only left no SemVer version in SKILL.md of: ${missing.join(", ")}. The sync stops here; check these skills and run again.`);
	const versions = skills.map((s) => `${s.name} ${frontmatterVersion(path.join(s.localPath, "SKILL.md"))}`);
	return {
		state: { versions },
		metrics: { skills: skills.length },
		output: versions.length ? `Local skill versions: ${versions.join(", ")}.` : "No local skills to version."
	};
};
function parseComparison(text) {
	const line = String(text).split(/\r?\n/).map((l) => l.trim().replace(/^`+|`+$/g, "")).reverse().find((l) => l.startsWith("result |"));
	if (!line) throw new Error("comparator report has no 'result |' line");
	const [, classification = "", marketplaceVersion = "none", bump = "none", nextVersion = "none", action = ""] = line.split("|").map((p) => p.trim());
	if (!CLASSIFICATIONS.includes(classification)) throw new Error(`comparator returned unknown classification '${classification}'`);
	return {
		classification,
		marketplaceVersion,
		bump,
		nextVersion,
		action,
		report: String(text).trim()
	};
}
function syncOptions(classification) {
	if (classification === "local-only") return [
		"create",
		"reject",
		"leave"
	];
	if (classification === "adapter-candidate") return [
		"move-to-adapter",
		...ADOPT,
		"revert-local",
		"leave"
	];
	return [
		...ADOPT,
		"revert-local",
		"leave"
	];
}
var syncRows = async ({ state }) => {
	const discovered = stateOf(state, "discover").compare;
	const compared = stateOf(state, "compare");
	const rows = discovered.map((a) => {
		const c = compared[a.id];
		if (!c) throw new Error(`no comparison for ${a.type} ${a.name}`);
		const candidate = c.classification === "local-only" ? a.localVersion !== "none" ? a.localVersion : "1.0.0" : c.nextVersion;
		const line = `${a.type} ${a.name}: ${c.classification}; marketplace ${c.marketplaceVersion}; bump ${c.bump}; proposed ${candidate}; recommended ${c.action || "none"}`;
		return {
			type: a.type,
			name: a.name,
			classification: c.classification,
			marketplaceVersion: c.marketplaceVersion,
			bump: c.bump,
			nextVersion: candidate,
			action: c.action,
			line,
			options: syncOptions(c.classification)
		};
	});
	const decide = rows.filter((r) => r.classification !== "identical");
	return {
		state: {
			rows,
			decide,
			table: rows.map((r) => r.line).join("\n")
		},
		metrics: {
			rows: rows.length,
			decide: decide.length
		},
		output: `${rows.length} artifacts compared, ${decide.length} need a decision.`
	};
};
function bumpVersion(version, bump) {
	const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
	if (!match) return "1.0.0";
	const [major, minor, patch] = match.slice(1).map(Number);
	if (bump === "major") return `${major + 1}.0.0`;
	if (bump === "minor") return `${major}.${minor + 1}.0`;
	return `${major}.${minor}.${patch + 1}`;
}
var KEEP_LOCAL = "Keep project adapters, secrets, local paths, credentials and runtime settings out of the marketplace.";
function applyInstruction(row, root, version) {
	const adapt = path.join(root, "skills", "marketplace", "olko-adapt-to-marketplace", "SKILL.md");
	if (row.decision === "create" && row.type === "skill") return `Create the marketplace skill ${row.name} from the local skill ${row.localPath}. Read ${adapt} and meet its validation requirements before you add the registry entry. Put it in the fitting category under ${path.join(root, "skills")}, set version ${version} in its SKILL.md frontmatter and add its entry to ${path.join(root, "registry.json")} at version ${version}. ${KEEP_LOCAL}`;
	if (row.decision === "create") return `Create the marketplace agent ${row.name}: copy the local definition ${row.localPath} to ${path.join(root, "agents", "opencode", `${row.name}.md`)} and add a valid entry for it to ${path.join(root, "agents", "opencode", "index.json")} at version ${version}, with its stack, role and declared skills taken from the definition. ${KEEP_LOCAL}`;
	if (row.type === "skill") return `Update only the marketplace skill directory ${row.marketplacePath} with the portable changes of the local skill ${row.localPath}. Set version ${version} in its SKILL.md frontmatter and in its entry in ${path.join(root, "registry.json")}. ${KEEP_LOCAL}`;
	return `Update only ${row.marketplacePath} with the portable changes of the local agent ${row.localPath}, and set version ${version} on its entry in ${path.join(root, "agents", "opencode", "index.json")}. Keep its permissions, declared skills and delegates unless they are the approved change. ${KEEP_LOCAL}`;
}
function acceptedRoute(decision) {
	if (decision === "revert-local") return "revert";
	if (decision === "move-to-adapter") return "adapter";
	return "change";
}
var syncPlanApply = async ({ state, answers }) => {
	const { rows, decide } = stateOf(state, "rows");
	const discovered = stateOf(state, "discover").compare;
	const root = marketplaceRoot(state);
	const decisionOf = (name) => {
		const index = decide.findIndex((d) => d.name === name);
		return index < 0 ? "none" : answers?.[`q-sync-${index}`] ?? "unanswered";
	};
	const decided = rows.map((r) => ({
		...r,
		decision: decisionOf(r.name)
	}));
	const accepted = decided.filter((r) => ![
		"none",
		"leave",
		"reject",
		"unanswered"
	].includes(r.decision)).map((r) => {
		const artifact = discovered.find((a) => a.name === r.name);
		const version = r.decision.startsWith("adopt-") ? bumpVersion(r.marketplaceVersion, r.decision.slice(6)) : r.decision === "create" ? r.nextVersion : r.marketplaceVersion;
		const row = {
			...r,
			localPath: artifact.localPath,
			marketplacePath: artifact.marketplacePath
		};
		return {
			...row,
			route: acceptedRoute(r.decision),
			version,
			instruction: applyInstruction(row, root, version)
		};
	});
	return {
		state: {
			decided,
			accepted
		},
		metrics: { accepted: accepted.length },
		output: accepted.length ? `${accepted.length} accepted decisions to apply: ${accepted.map((a) => `${a.name} ${a.decision}`).join(", ")}.` : "No accepted decisions: nothing to apply, publish or install."
	};
};
function copyDir(from, to, keep) {
	for (const entry of fs.existsSync(to) ? fs.readdirSync(to) : []) if (!keep.includes(entry)) fs.rmSync(path.join(to, entry), {
		recursive: true,
		force: true
	});
	fs.cpSync(from, to, {
		recursive: true,
		force: true
	});
}
var revertLocal = async ({ state }) => {
	const row = stateOf(state, "apply-next").item;
	if (row.marketplacePath === "none" || !fs.existsSync(row.marketplacePath)) throw new Error(`${row.type} ${row.name} has no marketplace counterpart to revert to`);
	if (row.type === "skill") copyDir(row.marketplacePath, row.localPath, ["project.md"]);
	else fs.copyFileSync(row.marketplacePath, row.localPath);
	return {
		state: { reverted: row.name },
		metrics: { reverted: 1 },
		output: `Local ${row.type} ${row.name} replaced with ${row.marketplacePath}.`
	};
};
var validateMarketplace = async ({ state, exec }) => {
	if (!exec) throw new Error("sync.validate needs the host exec tool");
	const root = marketplaceRoot(state);
	const accepted = stateOf(state, "plan").accepted.filter((a) => a.route !== "revert");
	const results = [];
	let failed = 0;
	const run = async (label, command, args, cwd = root) => {
		const res = await exec(command, args, { cwd });
		if (res.code !== 0) failed += 1;
		results.push(`${label}: ${res.code === 0 ? "pass" : `FAIL ${(res.stderr || res.stdout).trim().split(/\r?\n/).slice(-3).join(" ")}`}`);
	};
	if (accepted.some((a) => a.type === "skill")) await run("registry --fix", "node", ["scripts/registry.mjs", "--fix"]);
	for (const agent of accepted.filter((a) => a.type === "agent")) {
		const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-check-"));
		await run(`install-opencode-agents ${agent.name}`, "node", [
			"scripts/install-opencode-agents.mjs",
			"--project",
			scratch,
			"--agent",
			agent.name
		]);
		fs.rmSync(scratch, {
			recursive: true,
			force: true
		});
	}
	if (accepted.length) await run("node tests", "node", [
		"--test",
		"scripts/registry.test.mjs",
		"scripts/install-opencode-agents.test.mjs",
		"scripts/readme.test.mjs"
	]);
	const status = (await exec("git", [
		"-C",
		root,
		"status",
		"--porcelain",
		"--untracked-files=all"
	])).stdout.trim();
	const diffStat = (await exec("git", [
		"-C",
		root,
		"diff",
		"--stat"
	])).stdout.trim();
	const versions = accepted.map((a) => `${a.type} ${a.name} ${a.decision} -> ${a.version}`).join("\n");
	return {
		state: {
			changed: status ? 1 : 0,
			status,
			diffStat,
			versions,
			summary: results.join("; ") || "nothing to validate",
			failed
		},
		metrics: {
			changed: status ? status.split(/\r?\n/).length : 0,
			failed
		},
		output: `Validation: ${results.join("; ") || "nothing to validate"}.`
	};
};
function parseApplied(text) {
	const line = String(text).split(/\r?\n/).map((l) => l.trim().replace(/^`+|`+$/g, "")).reverse().find((l) => /^(applied|blocked) \|/.test(l));
	if (!line) throw new Error("apply output has no 'applied |' line");
	const [status, files = "", version = ""] = line.split("|").map((p) => p.trim());
	if (status === "blocked") throw new Error(`apply blocked: ${line}`);
	return {
		files: files.split(",").map((f) => f.trim()).filter(Boolean),
		version
	};
}
function parsePrLine(text) {
	const line = String(text).split(/\r?\n/).map((l) => l.trim().replace(/^`+|`+$/g, "")).reverse().find((l) => l.startsWith("pr |"));
	if (!line) throw new Error("publish output has no 'pr |' line");
	const [, url = "", branch = "", commit = ""] = line.split("|").map((p) => p.trim());
	if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(url)) throw new Error(`publish output has no PR URL: ${line}`);
	if (branch === "main") throw new Error("publish pushed to main; the sync requires a feature branch");
	return {
		url,
		branch,
		commit
	};
}
var waitForChecks = async ({ state, exec, nodeId, input }) => {
	if (!exec) throw new Error("sync.waitChecks needs the host exec tool");
	const res = await exec("gh", [
		"pr",
		"checks",
		(input.prUrl ? { url: input.prUrl } : stateOf(state, "publish-pr").publish).url,
		"--watch",
		"--fail-fast"
	]);
	const round = ((nodeId ? state[nodeId]?.round : 0) ?? 0) + 1;
	return {
		state: {
			round,
			passed: res.code === 0
		},
		metrics: {
			round,
			passed: res.code === 0 ? 1 : 0
		},
		output: `CI checks ${res.code === 0 ? "passed" : "did not pass"}: ${(res.stdout || res.stderr).trim().split(/\r?\n/).slice(-3).join(" ")}`
	};
};
var prOf = async ({ state }) => {
	const parsed = stateOf(state, "publish");
	const pr = Object.values(parsed)[0];
	if (!pr) throw new Error("publish returned no PR");
	return {
		state: { publish: pr },
		metrics: { prs: 1 },
		output: `PR ${pr.url} on branch ${pr.branch}.`
	};
};
var squashMerge = async ({ state, exec, args, input }) => {
	if (!exec) throw new Error("sync.merge needs the host exec tool");
	const root = typeof args.path === "string" ? String(args.path.split(".").reduce((v, k) => v && typeof v === "object" ? v[k] : void 0, state) ?? "") : input.path ?? marketplaceRoot(state);
	const pr = input.prUrl ? {
		url: input.prUrl,
		branch: input.prBranch ?? ""
	} : stateOf(state, "publish-pr").publish;
	if (JSON.parse((await exec("gh", [
		"pr",
		"view",
		pr.url,
		"--json",
		"isDraft"
	])).stdout || "{}").isDraft) {
		const ready = await exec("gh", [
			"pr",
			"ready",
			pr.url
		]);
		if (ready.code !== 0) throw new Error(`gh pr ready failed: ${(ready.stderr || ready.stdout).trim()}`);
	}
	const merge = await exec("gh", [
		"pr",
		"merge",
		pr.url,
		"--squash",
		"--delete-branch"
	], { cwd: root });
	if (merge.code !== 0) throw new Error(`squash merge failed: ${(merge.stderr || merge.stdout).trim()}`);
	const commit = JSON.parse((await exec("gh", [
		"pr",
		"view",
		pr.url,
		"--json",
		"mergeCommit"
	])).stdout || "{}").mergeCommit?.oid;
	if (!commit) throw new Error(`no merge commit for ${pr.url}`);
	for (const args of [["checkout", "main"], [
		"pull",
		"--ff-only",
		"origin",
		"main"
	]]) {
		const res = await exec("git", [
			"-C",
			root,
			...args
		]);
		if (res.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${res.stderr.trim()}`);
	}
	await exec("git", [
		"-C",
		root,
		"branch",
		"-D",
		pr.branch
	]);
	if ((await exec("git", [
		"-C",
		root,
		"merge-base",
		"--is-ancestor",
		commit,
		"origin/main"
	])).code !== 0) throw new Error(`merge commit ${commit} is not on origin/main`);
	return {
		state: { commit },
		metrics: { merged: 1 },
		output: `Squash merged ${pr.url} as ${commit.slice(0, 12)}; local main updated, branch ${pr.branch} deleted.`
	};
};
async function openskillsCommand(exec) {
	if (process.env.OPENSKILLS_CLI) return ["node", [process.env.OPENSKILLS_CLI]];
	if ((await exec("openskills", ["--help"])).code === 0) return ["openskills", []];
	for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
		const cli = path.join(dir, "node_modules", "openskills", "dist", "cli.js");
		if (fs.existsSync(path.join(dir, "openskills.cmd")) && fs.existsSync(cli)) return ["node", [cli]];
	}
	throw new Error("OpenSkills CLI not found: install openskills or set OPENSKILLS_CLI to its dist/cli.js");
}
var installArtifacts = async ({ state, exec, cwd }) => {
	if (!exec) throw new Error("sync.install needs the host exec tool");
	const root = marketplaceRoot(state);
	const project = path.resolve(cwd ?? ".");
	const accepted = stateOf(state, "plan").accepted.filter((a) => a.route !== "revert");
	const origin = (await exec("git", [
		"-C",
		root,
		"remote",
		"get-url",
		"origin"
	])).stdout.trim();
	const repo = origin.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(\.git)?$/)?.[1];
	if (!repo) throw new Error(`marketplace origin ${origin} is not a GitHub repository`);
	const [command, prefix] = await openskillsCommand(exec);
	const help = await exec(command, [
		...prefix,
		"install",
		"--help"
	]);
	if (help.code !== 0 || !/--universal/.test(help.stdout) || !/--yes/.test(help.stdout)) throw new Error("the installed OpenSkills CLI has no install --universal --yes");
	const lines = [];
	let failed = 0;
	for (const skill of accepted.filter((a) => a.type === "skill")) {
		const dir = skillDirIn(root, skill.name);
		if (!dir) throw new Error(`skill ${skill.name} is not in ${root} after the merge`);
		const subpath = path.relative(root, dir).split(path.sep).join("/");
		const res = await exec(command, [
			...prefix,
			"install",
			`${repo}/${subpath}`,
			"--universal",
			"--yes"
		], { cwd: project });
		const installed = path.join(project, ".agent", "skills", skill.name);
		if (res.code === 0 && fs.existsSync(installed)) {
			fs.cpSync(installed, path.join(project, ".agents", "skills", skill.name), {
				recursive: true,
				force: true
			});
			fs.rmSync(installed, {
				recursive: true,
				force: true
			});
		}
		const same = fs.existsSync(path.join(project, ".agents", "skills", skill.name, "SKILL.md")) && fs.readFileSync(path.join(project, ".agents", "skills", skill.name, "SKILL.md"), "utf8") === (await exec("git", [
			"-C",
			root,
			"show",
			`origin/main:${subpath}/SKILL.md`
		])).stdout;
		if (res.code !== 0 || !same) failed += 1;
		lines.push(`skill ${skill.name}: ${res.code !== 0 ? `FAIL ${res.stderr.trim().slice(-200)}` : same ? "installed, matches origin/main" : "installed, DIFFERS from origin/main"}`);
	}
	for (const agent of accepted.filter((a) => a.type === "agent")) {
		const res = await exec("node", [
			path.join(root, "scripts", "install-opencode-agents.mjs"),
			"--project",
			project,
			"--agent",
			agent.name,
			"--force"
		]);
		const local = path.join(project, ".opencode", "agents", `${agent.name}.md`);
		const same = fs.existsSync(local) && fs.readFileSync(local, "utf8") === (await exec("git", [
			"-C",
			root,
			"show",
			`origin/main:agents/opencode/${agent.name}.md`
		])).stdout;
		if (res.code !== 0 || !same) failed += 1;
		lines.push(`agent ${agent.name}: ${res.code !== 0 ? `FAIL ${res.stderr.trim().slice(-200)}` : same ? "installed, matches origin/main" : "installed, DIFFERS from origin/main"}`);
	}
	return {
		state: {
			lines,
			failed
		},
		metrics: {
			installed: lines.length - failed,
			failed
		},
		output: `Install: ${lines.join("; ")}.`
	};
};
var syncMemorySave = async ({ state }) => {
	const memory = state.memory;
	const install = stateOf(state, "install");
	if (!memory?.file || install.failed) return {
		state: { written: 0 },
		metrics: { written: 0 },
		output: "Memory: nothing verified to record."
	};
	const lines = stateOf(state, "plan").accepted.filter((a) => a.route !== "revert").map((a) => `confirmed:sync ${a.decision} ${a.type} ${a.name} ${a.version} installed and verified`);
	fs.mkdirSync(path.dirname(memory.file), { recursive: true });
	fs.appendFileSync(memory.file, `${lines.join("\n")}\n`);
	return {
		state: { written: lines.length },
		metrics: { written: lines.length },
		output: `Memory: ${lines.length} verified sync decisions recorded in ${memory.file}.`
	};
};
var syncReport = async ({ state }) => {
	const plan = stateOf(state, "plan");
	const source = state.safe?.["safe-source"] ?? state["safe-source"] ?? {};
	const lines = plan.decided.map((r) => `${r.type} ${r.name}: ${r.classification} -> ${r.decision}`);
	const validate = state.validate;
	const pr = state["publish-pr"]?.publish;
	const merged = state.merge ?? state.pr?.merge;
	const install = state.install;
	const outcome = !validate ? "Marketplace, branches and installs: unchanged." : !validate.changed ? "Marketplace unchanged; local reverts only. Nothing to publish." : !pr ? `Marketplace changes applied in the working tree of ${marketplaceRoot(state)} and not published. Validation: ${validate.summary}.` : !merged ? `Published as ${pr.url}; not merged, nothing installed.` : `Published as ${pr.url}, squash merged as ${merged.commit?.slice(0, 12)}. Install: ${install?.lines?.join("; ") ?? "not run"}.`;
	return {
		state: { lines },
		metrics: { rows: lines.length },
		output: [
			`Marketplace sync report (marketplace ${marketplaceRoot(state)} at ${source.head?.slice(0, 12) ?? "unknown"})`,
			...lines,
			outcome
		].join("\n")
	};
};
var DIRECTIONS = [
	["target", "target->olko"],
	["olko", "olko->user"],
	["user", "user->olko"]
];
var BUMPS = [
	"patch",
	"minor",
	"major"
];
var VERDICT_ACTIONS = {
	"target-only": [
		"port-to-olko",
		"exclude",
		"leave"
	],
	"olko-only": [
		"install-user",
		"reject",
		"exclude",
		"leave"
	],
	"user-only": [
		"publish-to-olko",
		"exclude",
		"leave"
	],
	"target-ahead": [
		...BUMPS.map((b) => `port-to-olko-${b}`),
		"exclude",
		"leave"
	],
	"olko-ahead": [
		"update-user",
		"exclude",
		"leave"
	],
	"user-ahead": [
		...BUMPS.map((b) => `publish-to-olko-${b}`),
		"revert-user",
		"exclude",
		"leave"
	],
	diverged: [
		"take-target",
		"take-olko",
		"exclude",
		"leave"
	],
	"platform-delta-only": ["leave", "exclude"]
};
function syncStateScript() {
	return path.join(marketplaceDir(), "plugins", "olko-sync", "skills", "olko-sync-state", "scripts", "sync-state.mjs");
}
async function syncState(exec, stateDir, args) {
	const res = await exec("node", [
		syncStateScript(),
		...args,
		"--state-dir",
		stateDir
	]);
	if (res.code !== 0) throw new Error(`sync-state ${args.slice(0, 2).join(" ")} failed: ${(res.stderr || res.stdout).trim()}`);
	return res.stdout;
}
function longPathOf(p) {
	const resolved = path.resolve(p);
	return fs.existsSync(resolved) ? fs.realpathSync.native(resolved) : resolved;
}
var claudeSyncState = async ({ input, exec }) => {
	if (!exec) throw new Error("csync.state needs the host exec tool");
	const stateDir = longPathOf(input.stateDir ?? process.env.OLKO_SYNC_HOME ?? path.join(os.homedir(), ".olko-sync"));
	await syncState(exec, stateDir, ["init"]);
	if (input.olko) await syncState(exec, stateDir, [
		"target",
		"set-olko",
		"--path",
		longPathOf(input.olko)
	]);
	if (input.target) {
		if (!input.targetName || !/^[a-z0-9-]+$/.test(input.targetName)) throw new Error("input.targetName must be a kebab-case name for the Claude marketplace in input.target");
		await syncState(exec, stateDir, [
			"target",
			"set",
			"--name",
			input.targetName,
			"--path",
			longPathOf(input.target)
		]);
	}
	const targets = JSON.parse(await syncState(exec, stateDir, ["target", "get"]));
	const name = input.targetName ?? targets.default;
	const target = name ? targets.targets[name]?.path : void 0;
	if (!targets.olko?.path) throw new Error("no Olko checkout: give input.olko (the Olko marketplace checkout path)");
	if (!target) throw new Error("no Claude marketplace target: give input.target and input.targetName");
	const user = longPathOf(input.user ?? path.join(os.homedir(), ".claude"));
	const stores = [
		{
			id: "target",
			path: target,
			layout: "plugins/*/skills/*/SKILL.md and plugins/*/agents/*.md"
		},
		{
			id: "olko",
			path: targets.olko.path,
			layout: "skills/*/*/SKILL.md, plugins/*/skills/*/SKILL.md, agents/opencode/*.md (versions in agents/opencode/index.json), plugins/*/agents/*.md (version in plugin.json)"
		},
		{
			id: "user",
			path: user,
			layout: "skills/*/SKILL.md and agents/*.md"
		}
	];
	return {
		state: {
			stateDir,
			olko: targets.olko.path,
			target,
			user,
			stores,
			leakTerms: targets.leakTerms,
			leakTermsText: targets.leakTerms.length ? `${targets.leakTerms.length} saved` : "none saved",
			script: syncStateScript()
		},
		metrics: { leakTerms: targets.leakTerms.length },
		output: `Sync state ready in ${stateDir}: Olko ${targets.olko.path}, user store ${user}, target set (name and path stay out of logs).`
	};
};
var claudeSyncLeakSave = async ({ state, exec, answers }) => {
	if (!exec) throw new Error("csync.leakSave needs the host exec tool");
	const { stateDir } = stateOf(state, "state");
	const answer = (answers?.["q-claude-sync-leak"] ?? "none").trim();
	const terms = /^none$/i.test(answer) ? [] : answer.split(",").map((t) => t.trim()).filter(Boolean);
	for (const term of terms) await syncState(exec, stateDir, [
		"target",
		"add-leak-term",
		"--term",
		term
	]);
	return {
		state: { added: terms.length },
		metrics: { added: terms.length },
		output: terms.length ? `${terms.length} leak terms added.` : "No leak terms added."
	};
};
function lastJsonBlock(text) {
	const raw = [...String(text).matchAll(/```json\s*([\s\S]*?)```/g)].at(-1)?.[1];
	if (!raw) throw new Error("matcher output has no ```json block");
	return JSON.parse(raw);
}
function parseCapabilities(text) {
	const data = lastJsonBlock(text);
	if (!Array.isArray(data.capabilities)) throw new Error("matcher JSON has no capabilities list");
	for (const c of data.capabilities) if (!c.id || !["skill", "agent"].includes(c.kind) || typeof c.copies !== "object") throw new Error(`matcher capability is malformed: ${JSON.stringify(c).slice(0, 200)}`);
	return {
		capabilities: data.capabilities,
		probable: data.probable ?? []
	};
}
function normalizeName(name) {
	return name.toLowerCase().replace(/^[a-z0-9-]+:/, "").replace(/^olko-/, "");
}
function parseInventory(text) {
	const data = lastJsonBlock(text);
	if (!Array.isArray(data.rows)) throw new Error("inventory JSON has no rows list");
	const rows = data.rows.filter((r) => r && (r.kind === "skill" || r.kind === "agent") && typeof r.name === "string" && typeof r.path === "string");
	if (rows.length !== data.rows.length) throw new Error(`inventory JSON has ${data.rows.length - rows.length} malformed rows`);
	return { rows };
}
var STORES = [
	"target",
	"olko",
	"user"
];
var claudeSyncInventories = async ({ state }) => {
	const inventory = stateOf(state, "inventory");
	const texts = Object.fromEntries(STORES.map((store) => [store, JSON.stringify(inventory[store]?.rows ?? [])]));
	const counts = Object.fromEntries(STORES.map((store) => [store, inventory[store]?.rows.length ?? 0]));
	return {
		state: {
			...texts,
			counts
		},
		metrics: counts,
		output: `Inventory: ${STORES.map((st) => `${st} ${counts[st]}`).join(", ")} artifacts.`
	};
};
function buildCapabilities(inventory, roots, linked) {
	const absolute = (store, p) => path.isAbsolute(p) ? p : path.join(roots[store], p);
	const key = (store, kind, name) => `${store}|${kind}|${name}`;
	const rowsByKey = /* @__PURE__ */ new Map();
	for (const store of STORES) for (const row of inventory[store]?.rows ?? []) rowsByKey.set(key(store, row.kind, row.name), {
		...row,
		store
	});
	const used = /* @__PURE__ */ new Set();
	const copyOf = (store, row) => ({
		name: row.name,
		path: absolute(store, row.path),
		...row.version ? { version: row.version } : {},
		...row.hash ? { hash: row.hash } : {}
	});
	const result = [];
	for (const c of linked) {
		const copies = {};
		for (const store of STORES) {
			const copy = c.copies[store];
			if (!copy) continue;
			const row = rowsByKey.get(key(store, c.kind, copy.name));
			if (!row || used.has(key(store, c.kind, copy.name))) continue;
			used.add(key(store, c.kind, copy.name));
			copies[store] = copyOf(store, row);
		}
		if (Object.keys(copies).length) result.push({
			...c,
			copies
		});
	}
	const byName = /* @__PURE__ */ new Map();
	for (const [k, row] of rowsByKey) {
		if (used.has(k)) continue;
		const name = `${row.kind}|${normalizeName(row.name)}`;
		byName.set(name, [...byName.get(name) ?? [], row]);
	}
	for (const [name, rows] of byName) {
		const copies = {};
		for (const row of rows) if (!copies[row.store]) copies[row.store] = copyOf(row.store, row);
		const stores = Object.keys(copies).length;
		result.push({
			id: name.split("|")[1],
			basis: stores > 1 ? "name" : "single",
			kind: rows[0].kind,
			copies
		});
	}
	return result;
}
var claudeSyncCapabilities = async ({ state }) => {
	const parsed = Object.values(stateOf(state, "match"))[0];
	if (!parsed) throw new Error("the matcher returned nothing");
	const { target, olko, user } = stateOf(state, "state");
	const capabilities = buildCapabilities(stateOf(state, "inventory"), {
		target,
		olko,
		user
	}, parsed.capabilities);
	const linked = capabilities.filter((c) => Object.keys(c.copies).length > 1).length;
	return {
		state: {
			capabilities,
			probable: parsed.probable
		},
		metrics: {
			capabilities: capabilities.length,
			linked,
			probable: parsed.probable.length
		},
		output: `${capabilities.length} capabilities (${linked} across stores), ${parsed.probable.length} probable links.`
	};
};
var claudeSyncSelect = async ({ state, input }) => {
	const { capabilities, probable } = stateOf(state, "capabilities");
	const wanted = input.artifacts?.map(normalizeName);
	const matches = (c) => !wanted || [c.id, ...Object.values(c.copies).map((copy) => copy?.name ?? "")].some((n) => wanted.includes(normalizeName(n)));
	const selected = capabilities.filter(matches);
	if (wanted) {
		const missing = input.artifacts.filter((a) => !selected.some((c) => [c.id, ...Object.values(c.copies).map((copy) => copy?.name ?? "")].some((n) => normalizeName(n) === normalizeName(a))));
		if (missing.length) throw new Error(`input.artifacts not found in any store: ${missing.join(", ")}`);
	}
	const ask = probable.filter((p) => selected.some((c) => c.id === p.id));
	return {
		state: {
			selected,
			probable: ask
		},
		metrics: {
			selected: selected.length,
			probable: ask.length
		},
		output: `${selected.length} capabilities selected${wanted ? ` from input.artifacts` : ""}; ${ask.length} probable links to confirm.`
	};
};
var claudeSyncExclusions = async ({ state, exec, answers }) => {
	if (!exec) throw new Error("csync.exclusions needs the host exec tool");
	const { stateDir } = stateOf(state, "state");
	const { selected, probable } = stateOf(state, "select");
	const split = new Set(probable.filter((_, i) => answers?.[`q-claude-sync-probable-${i}`] === "split").map((p) => p.id));
	const capabilities = selected.flatMap((c) => split.has(c.id) ? Object.entries(c.copies).map(([store, copy]) => ({
		...c,
		id: `${c.id}@${store}`,
		basis: "split",
		copies: { [store]: copy }
	})) : [c]);
	const compare = [];
	const excluded = [];
	for (const c of capabilities) {
		const checks = [];
		for (const [store, direction] of DIRECTIONS) {
			const copy = c.copies[store];
			if (!copy) continue;
			const out = await syncState(exec, stateDir, [
				"exclusion",
				"check",
				"--artifact",
				`${c.kind}:${copy.name}`,
				"--direction",
				direction,
				...copy.version && copy.version !== "—" ? ["--version", copy.version] : []
			]);
			checks.push(JSON.parse(out));
		}
		if (checks.length && checks.every((x) => x.status === "excluded")) excluded.push({
			id: c.id,
			reason: checks[0]?.reason ?? "excluded"
		});
		else compare.push({
			...c,
			copiesText: Object.entries(c.copies).map(([store, copy]) => `${store}: ${copy?.name} ${copy?.path} version ${copy?.version ?? "—"} hash ${copy?.hash ?? "—"}`).join("\n")
		});
	}
	return {
		state: {
			compare,
			excluded
		},
		metrics: {
			compare: compare.length,
			excluded: excluded.length
		},
		output: `${compare.length} capabilities to compare, ${excluded.length} excluded.`
	};
};
function parseVerdict(text) {
	const line = String(text).split(/\r?\n/).map((l) => l.trim().replace(/^`+|`+$/g, "")).reverse().find((l) => l.startsWith("result |"));
	if (!line) throw new Error("comparator report has no 'result |' line");
	const [, verdict = "", bump = "none", nextVersion = "none", action = ""] = line.split("|").map((p) => p.trim());
	if (verdict !== "identical" && !VERDICT_ACTIONS[verdict]) throw new Error(`comparator returned unknown verdict '${verdict}'`);
	return {
		verdict,
		bump,
		nextVersion,
		action,
		report: String(text).trim()
	};
}
function claudeSyncActions(verdict) {
	return VERDICT_ACTIONS[verdict] ?? [];
}
var claudeSyncRows = async ({ state }) => {
	const { compare, excluded } = stateOf(state, "exclusions");
	const verdicts = state.compare ?? {};
	const rows = compare.map((c) => {
		const v = verdicts[c.id];
		if (!v) throw new Error(`no verdict for capability ${c.id}`);
		const copies = Object.entries(c.copies).map(([store, copy]) => `${store} ${copy?.version ?? "—"}`).join(", ");
		return {
			id: c.id,
			kind: c.kind,
			verdict: v.verdict,
			bump: v.bump,
			nextVersion: v.nextVersion,
			action: v.action,
			options: claudeSyncActions(v.verdict),
			line: `${c.kind} ${c.id}: ${v.verdict}; copies ${copies}; recommended ${v.action || "none"}; proposed Olko version ${v.nextVersion}`
		};
	});
	const decide = rows.filter((r) => r.verdict !== "identical");
	return {
		state: {
			rows,
			decide,
			excluded,
			table: [...rows.map((r) => r.line), ...excluded.map((e) => `${e.id}: excluded (${e.reason})`)].join("\n")
		},
		metrics: {
			rows: rows.length,
			decide: decide.length
		},
		output: `${rows.length} capabilities compared, ${decide.length} need a decision, ${excluded.length} excluded.`
	};
};
var claudeSyncPlan = async ({ state, answers }) => {
	const { rows, decide } = stateOf(state, "rows");
	const decided = rows.map((r) => {
		const index = decide.findIndex((d) => d.id === r.id);
		return {
			...r,
			decision: index < 0 ? "none" : answers?.[`q-claude-sync-${index}`] ?? "unanswered"
		};
	});
	const records = decided.filter((r) => r.decision === "exclude");
	const rejects = decided.filter((r) => r.decision === "reject");
	const changes = decided.filter((r) => ![
		"none",
		"leave",
		"exclude",
		"reject",
		"unanswered"
	].includes(r.decision));
	return {
		state: {
			decided,
			records,
			rejects,
			changes
		},
		metrics: {
			records: records.length,
			rejects: rejects.length,
			changes: changes.length
		},
		output: `${changes.length} rows to apply, ${records.length} exclusions and ${rejects.length} rejections to record.`
	};
};
var claudeSyncRecord = async ({ state, exec, answers }) => {
	if (!exec) throw new Error("csync.record needs the host exec tool");
	const { stateDir } = stateOf(state, "state");
	const { compare } = stateOf(state, "exclusions");
	const { records, rejects } = stateOf(state, "plan");
	const lines = [];
	for (const [i, r] of [...records, ...rejects].entries()) {
		const c = compare.find((x) => x.id === r.id);
		const source = c.copies.target ?? c.copies.olko ?? c.copies.user;
		const artifact = `${r.kind}:${source?.name}`;
		if (r.decision === "reject") await syncState(exec, stateDir, [
			"exclusion",
			"add",
			"--artifact",
			artifact,
			"--reason",
			"rejected new artifact",
			"--kind",
			"rejected-new",
			"--version",
			c.copies.olko?.version ?? "0.0.0"
		]);
		else {
			const scope = answers?.[`q-claude-sync-scope-${i}`] ?? "all";
			await syncState(exec, stateDir, [
				"exclusion",
				"add",
				"--artifact",
				artifact,
				"--reason",
				answers?.[`q-claude-sync-reason-${i}`] ?? "excluded by the user",
				...scope === "all" ? [] : ["--scope", scope]
			]);
		}
		lines.push(`${artifact} ${r.decision}`);
	}
	return {
		state: { lines },
		metrics: { recorded: lines.length },
		output: lines.length ? `Recorded: ${lines.join(", ")}.` : "Nothing to record."
	};
};
var claudeSyncReport = async ({ state }) => {
	const plan = stateOf(state, "plan");
	const { excluded } = stateOf(state, "exclusions");
	const lines = [...plan.decided.map((r) => `row | ${r.id} | ${r.verdict} | ${r.decision}`), ...excluded.map((e) => `row | ${e.id} | excluded | excluded`)];
	const changes = plan.decided.filter((r) => ![
		"none",
		"leave",
		"exclude",
		"reject",
		"unanswered"
	].includes(r.decision)).length;
	const applied = state["apply-record"]?.applied ?? [];
	const pr = state["publish-pr"]?.publish;
	const merged = state.merge ?? state.pr?.merge;
	const olkoChanged = state["apply-record"]?.olkoChanged;
	const published = pr ? merged ? `Published as ${pr.url}, squash merged as ${merged.commit?.slice(0, 12)}.` : `Published as draft ${pr.url}, not merged.` : olkoChanged ? "Olko changes are in the working tree and not published." : "No Olko change to publish.";
	const outcome = changes ? `Applied ${applied.length} of ${changes} rows: ${applied.join(", ") || "none"}. ${published}` : "Olko, the target and the user scope: unchanged.";
	const consolidation = state["consolidation-record"];
	const consolidated = consolidation ? `Consolidation: ${consolidation.accepted} accepted (plan ${consolidation.planFile}), ${consolidation.rejected} rejected.` : "Consolidation: skipped.";
	return {
		state: { lines },
		metrics: { rows: lines.length },
		output: [
			"Claude sync report",
			...lines,
			outcome,
			consolidated
		].join("\n")
	};
};
function directionOf(decision) {
	if (decision.startsWith("port-to-olko") || decision === "take-target") return {
		direction: "to-olko",
		from: "target",
		overwrite: decision === "take-target"
	};
	if (decision.startsWith("publish-to-olko")) return {
		direction: "to-olko",
		from: "user",
		overwrite: false
	};
	return {
		direction: "to-user",
		from: "olko",
		overwrite: decision === "take-olko" || decision === "revert-user"
	};
}
var claudeSyncStagePlan = async ({ state, answers, nodeId }) => {
	const { changes } = stateOf(state, "plan");
	const { compare } = stateOf(state, "exclusions");
	const rows = stateOf(state, "rows").rows;
	const previous = nodeId ? state[nodeId] : void 0;
	const round = (previous?.round ?? 0) + 1;
	const added = (state.findings?.missing ?? []).filter((_, i) => answers?.[`q-claude-sync-missing-${previous?.round ?? 0}-${i}`] === "install-user");
	const items = [];
	const add = (row) => items.push({
		...row,
		stageDir: fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "factory-stage-")))
	});
	if (round === 1) for (const change of changes) {
		const c = compare.find((x) => x.id === change.id);
		const { direction, from, overwrite } = directionOf(change.decision);
		const source = c.copies[from];
		if (!source) throw new Error(`${change.decision} for ${change.id} needs a ${from} copy`);
		const existing = direction === "to-olko" ? c.copies.olko?.path : c.copies.user?.path;
		const bump = change.decision.match(/-(patch|minor|major)$/)?.[1];
		const version = direction === "to-user" ? c.copies.olko?.version ?? "none" : bump ? bumpVersion(c.copies.olko?.version ?? "0.0.0", bump) : rows.find((r) => r.id === change.id)?.nextVersion ?? "1.0.0";
		add({
			id: change.id,
			rowId: change.id,
			kind: c.kind,
			decision: change.decision,
			direction,
			source: source.path,
			sourceStore: from,
			existing: existing ?? "none",
			overwrite,
			version: direction === "to-user" || /^\d+\.\d+\.\d+$/.test(version) ? version : "1.0.0"
		});
	}
	else for (const m of added) add({
		id: `${m.kind}-${m.name}`,
		rowId: m.id,
		kind: m.kind,
		decision: "install-user",
		direction: "to-user",
		source: m.olkoPath,
		sourceStore: "olko",
		existing: "none",
		overwrite: false,
		version: "none"
	});
	return {
		state: {
			items: [...previous?.items ?? [], ...items],
			wave: items,
			round
		},
		metrics: {
			staged: items.length,
			round
		},
		output: `Wave C round ${round}: ${items.length} rows to stage.`
	};
};
function parseStaged(text) {
	const data = lastJsonBlock(text);
	if (typeof data.name !== "string" || typeof data.stagedPath !== "string") throw new Error("porter JSON needs name and stagedPath");
	return {
		name: data.name,
		stagedPath: data.stagedPath,
		findings: data.findings ?? [],
		missing: data.missing ?? [],
		entry: data.entry ?? null,
		category: data.category ?? null,
		blockers: data.blockers ?? []
	};
}
var claudeSyncFindings = async ({ state }) => {
	const { wave: items, items: all, round } = stateOf(state, "stage-plan");
	const staged = stateOf(state, "stage");
	const olko = stateOf(state, "state").olko;
	const blocked = items.filter((i) => staged[i.id]?.blockers.length).map((i) => `${i.id}: ${staged[i.id].blockers.join("; ")}`);
	if (blocked.length) throw new Error(`porter blockers, nothing applied: ${blocked.join(" | ")}`);
	const findings = items.flatMap((i) => (staged[i.id]?.findings ?? []).map((f) => ({
		item: i.id,
		...f,
		line: `${i.id} ${f.file}:${f.line} — ${f.category} — proposed: ${f.replacement}`
	})));
	const missing = items.filter((i) => i.direction === "to-user").flatMap((i) => (staged[i.id]?.missing ?? []).map((ref) => {
		const [kind, name] = ref.split(":");
		const olkoPath = kind === "agent" ? path.join(olko, "agents", "opencode", `${name}.md`) : skillDirIn(olko, name) ?? "none";
		return {
			id: `${kind}:${name}`,
			kind,
			name,
			olkoPath,
			for: i.id,
			line: `${kind} ${name}, needed by ${i.id}`
		};
	})).filter((m, i, list) => m.olkoPath !== "none" && list.findIndex((x) => x.id === m.id) === i && !all.some((it) => it.id === `${m.kind}-${m.name}`));
	return {
		state: {
			findings,
			missing,
			round
		},
		metrics: {
			findings: findings.length,
			missing: missing.length
		},
		output: `${findings.length} sanitize findings to decide, ${missing.length} missing dependencies.`
	};
};
var claudeSyncFixes = async ({ state, answers, nodeId }) => {
	const { findings, round } = stateOf(state, "findings");
	const previous = nodeId ? state[nodeId] : void 0;
	const decided = findings.map((f, i) => ({
		...f,
		decision: answers?.[`q-claude-sync-finding-${round}-${i}`] ?? "skip-row"
	}));
	const skipped = [.../* @__PURE__ */ new Set([...previous?.skipped ?? [], ...decided.filter((d) => d.decision === "skip-row").map((d) => d.item)])];
	const byItem = /* @__PURE__ */ new Map();
	for (const d of decided.filter((d) => d.decision === "replace" || d.decision === "delete")) byItem.set(d.item, [...byItem.get(d.item) ?? [], `${d.decision}: ${d.line}`]);
	const { items, wave } = stateOf(state, "stage-plan");
	const fixes = wave.filter((i) => byItem.has(i.id) && !skipped.includes(i.id)).map((i) => ({
		...i,
		decisions: byItem.get(i.id).join("\n")
	}));
	const ready = items.filter((i) => !skipped.includes(i.id));
	return {
		state: {
			fixes,
			ready,
			skipped
		},
		metrics: {
			fixes: fixes.length,
			ready: ready.length,
			skipped: skipped.length
		},
		output: `${ready.length} rows ready, ${fixes.length} need staged fixes, ${skipped.length} skipped by a finding.`
	};
};
function olkoCategories(olko) {
	const skills = path.join(olko, "skills");
	return fs.existsSync(skills) ? fs.readdirSync(skills).filter((c) => fs.statSync(path.join(skills, c)).isDirectory()).sort() : [];
}
var claudeSyncMoreDeps = async ({ state, answers }) => {
	const { missing, round } = stateOf(state, "findings");
	const more = round < 2 ? missing.filter((_, i) => answers?.[`q-claude-sync-missing-${round}-${i}`] === "install-user").length : 0;
	return {
		state: { more },
		metrics: { more },
		output: more ? `${more} missing dependencies to stage in the next wave.` : "No more dependencies to stage."
	};
};
var claudeSyncApplyPlan = async ({ state }) => {
	const { ready } = stateOf(state, "fixes");
	const staged = stateOf(state, "stage");
	const olko = stateOf(state, "state").olko;
	const categories = olkoCategories(olko);
	const rows = ready.map((i) => {
		const s = staged[i.id];
		const newSkill = i.direction === "to-olko" && i.kind === "skill" && i.existing === "none";
		const diffFile = path.join(i.stageDir, "diff.patch");
		const diff = fs.existsSync(diffFile) ? fs.readFileSync(diffFile, "utf8").slice(0, 6e3) : "new file, no existing copy";
		return {
			...i,
			name: s.name,
			stagedPath: s.stagedPath,
			needsCategory: newSkill,
			categories: s.category && categories.includes(s.category) ? [s.category, ...categories.filter((c) => c !== s.category)] : categories,
			diff
		};
	});
	return {
		state: { rows },
		metrics: { rows: rows.length },
		output: `${rows.length} rows to apply one at a time.`
	};
};
async function contentHash(exec, stateDir, target) {
	return (await syncState(exec, stateDir, [
		"hash",
		"--path",
		target
	])).trim().split(/\s+/).at(-1) ?? "";
}
async function recordLineage(exec, stateDir, capability, store, target, sourceStore, source) {
	const hash = await contentHash(exec, stateDir, target);
	const sourceHash = await contentHash(exec, stateDir, source);
	await syncState(exec, stateDir, [
		"lineage",
		"set",
		"--capability",
		capability.replace(/[^a-z0-9-]/g, "-"),
		"--store",
		store,
		"--path",
		target,
		"--hash",
		hash,
		"--ported-from",
		`${sourceStore}@${sourceHash}`
	]);
	return hash;
}
function upsertEntry(file, key, entry) {
	const json = JSON.parse(fs.readFileSync(file, "utf8"));
	const list = json[key];
	const index = list.findIndex((e) => e.name === entry.name);
	if (index >= 0) list[index] = {
		...list[index],
		...entry
	};
	else list.push(entry);
	fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}
var claudeSyncApplyOlko = async ({ state, exec, answers }) => {
	if (!exec) throw new Error("csync.applyOlko needs the host exec tool");
	const { item, index } = stateOf(state, "apply-next");
	const { olko, stateDir } = stateOf(state, "state");
	const staged = stateOf(state, "stage")[item.id];
	if (item.overwrite && answers?.[`q-claude-sync-overwrite-${index}`] !== "overwrite") return {
		state: { applied: false },
		metrics: {
			applied: 0,
			failed: 0
		},
		output: `${item.id}: overwrite not confirmed, nothing written.`
	};
	const results = [];
	let target;
	if (item.kind === "skill") {
		const category = item.needsCategory ? answers?.[`q-claude-sync-category-${index}`] : path.basename(path.dirname(item.existing));
		if (!category) throw new Error(`no category for ${item.name}`);
		target = item.existing !== "none" ? item.existing : path.join(olko, "skills", category, item.name);
		fs.mkdirSync(target, { recursive: true });
		fs.cpSync(item.stagedPath, target, {
			recursive: true,
			force: true,
			filter: (f) => path.basename(f) !== "diff.patch"
		});
		upsertEntry(path.join(olko, "registry.json"), "skills", {
			...staged.entry ?? {},
			name: item.name,
			category,
			version: item.version
		});
		for (const args of [["scripts/registry.mjs", "--fix"], ["scripts/registry.mjs"]]) {
			const res = await exec("node", args, { cwd: olko });
			results.push(`${args.join(" ")}: ${res.code === 0 ? "pass" : `FAIL ${(res.stderr || res.stdout).trim().split(/\r?\n/).slice(-2).join(" ")}`}`);
		}
	} else {
		target = path.join(olko, "agents", "opencode", `${item.name}.md`);
		fs.copyFileSync(fs.statSync(item.stagedPath).isDirectory() ? path.join(item.stagedPath, `${item.name}.md`) : item.stagedPath, target);
		upsertEntry(path.join(olko, "agents", "opencode", "index.json"), "agents", {
			...staged.entry ?? {},
			name: item.name,
			version: item.version,
			file: `${item.name}.md`
		});
		const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-check-"));
		const res = await exec("node", [
			"scripts/install-opencode-agents.mjs",
			"--project",
			scratch,
			"--agent",
			item.name
		], { cwd: olko });
		fs.rmSync(scratch, {
			recursive: true,
			force: true
		});
		results.push(`install-opencode-agents ${item.name}: ${res.code === 0 ? "pass" : `FAIL ${(res.stderr || res.stdout).trim().split(/\r?\n/).slice(-2).join(" ")}`}`);
	}
	await recordLineage(exec, stateDir, item.id, "olko", target, item.sourceStore, item.source);
	const failed = results.filter((r) => r.includes("FAIL")).length;
	return {
		state: {
			applied: true,
			target,
			results,
			failed
		},
		metrics: {
			applied: 1,
			failed
		},
		output: `${item.id} -> Olko ${path.relative(olko, target)} at ${item.version}. ${results.join("; ")}`
	};
};
var claudeSyncApplyUser = async ({ state, exec, answers }) => {
	if (!exec) throw new Error("csync.applyUser needs the host exec tool");
	const { item, index } = stateOf(state, "apply-next");
	const { user, stateDir } = stateOf(state, "state");
	if (answers?.[`q-claude-sync-write-${index}`] !== "write") return {
		state: { applied: false },
		metrics: { applied: 0 },
		output: `${item.id}: write to the user scope declined.`
	};
	const target = item.kind === "skill" ? path.join(user, "skills", item.name) : path.join(user, "agents", `${item.name}.md`);
	if (item.kind === "skill") {
		fs.mkdirSync(target, { recursive: true });
		fs.cpSync(item.stagedPath, target, {
			recursive: true,
			force: true,
			filter: (f) => path.basename(f) !== "diff.patch"
		});
	} else fs.copyFileSync(fs.statSync(item.stagedPath).isDirectory() ? path.join(item.stagedPath, `${item.name}.md`) : item.stagedPath, target);
	await recordLineage(exec, stateDir, item.id, "user", target, "olko", item.source);
	return {
		state: {
			applied: true,
			target
		},
		metrics: { applied: 1 },
		output: `${item.id} -> user scope ${target}.`
	};
};
var claudeSyncApplyRecord = async ({ state, nodeId }) => {
	const previous = nodeId ? state[nodeId] : void 0;
	const { item } = stateOf(state, "apply-next");
	const result = item.direction === "to-olko" ? state["apply-olko"] : state["apply-user"];
	const applied = [...previous?.applied ?? [], ...result?.applied ? [`${item.id} ${item.direction}`] : []];
	const failed = (previous?.failed ?? 0) + (result?.failed ?? 0);
	return {
		state: {
			applied,
			failed,
			olkoChanged: applied.some((a) => a.endsWith("to-olko"))
		},
		metrics: {
			applied: applied.length,
			failed
		},
		output: `${applied.length} rows applied so far.`
	};
};
var claudeSyncOlkoTests = async ({ state, exec }) => {
	if (!exec) throw new Error("csync.olkoTests needs the host exec tool");
	const { olko } = stateOf(state, "state");
	const res = await exec("node", ["--test", "scripts/*.test.mjs"], { cwd: olko });
	const summary = (res.stdout.match(/^ℹ (pass|fail) \d+$/gm) ?? []).join(", ");
	return {
		state: {
			passed: res.code === 0,
			summary
		},
		metrics: { failed: res.code === 0 ? 0 : 1 },
		output: `Olko node tests: ${res.code === 0 ? "pass" : "FAIL"} (${summary || (res.stderr || res.stdout).trim().split(/\r?\n/).slice(-2).join(" ")}).`
	};
};
var claudeSyncLeakCheck = async ({ state, exec, input }) => {
	if (!exec) throw new Error("csync.leakCheck needs the host exec tool");
	const { olko, target, leakTerms } = stateOf(state, "state");
	const plugins = fs.existsSync(path.join(target, "plugins")) ? fs.readdirSync(path.join(target, "plugins")) : [];
	const portedPlugins = new Set(stateOf(state, "apply-plan").rows.filter((r) => r.sourceStore === "target").map((r) => path.relative(path.join(target, "plugins"), r.source).split(path.sep)[0]));
	const terms = [
		...leakTerms,
		input.targetName ?? "",
		target,
		path.basename(target),
		...plugins.filter((p) => !portedPlugins.has(p))
	].filter((t) => t.length > 2).map((t) => t.toLowerCase());
	const changed = (await exec("git", [
		"-C",
		olko,
		"status",
		"--porcelain",
		"--untracked-files=all"
	])).stdout.split(/\r?\n/).filter(Boolean).map((l) => l.slice(3).trim());
	const hits = [];
	for (const file of changed) {
		const full = path.join(olko, file);
		if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) continue;
		const added = file.endsWith(".json") ? (await exec("git", [
			"-C",
			olko,
			"diff",
			"--",
			file
		])).stdout.split(/\r?\n/).filter((l) => l.startsWith("+")).join("\n") : fs.readFileSync(full, "utf8");
		terms.forEach((t, n) => {
			if (added.toLowerCase().includes(t)) hits.push(`${file}: leak term #${n + 1}`);
		});
	}
	if (hits.length) throw new Error(`leak check failed, nothing published: ${hits.join("; ")}`);
	return {
		state: {
			changed,
			files: changed.join("\n")
		},
		metrics: {
			leaks: 0,
			changed: changed.length
		},
		output: `Leak check passed on ${changed.length} changed Olko files.`
	};
};
var claudeSyncPublish = async ({ state, exec }) => {
	if (!exec) throw new Error("csync.publish needs the host exec tool");
	const { olko } = stateOf(state, "state");
	const { changed } = stateOf(state, "leak-check");
	const rows = stateOf(state, "apply-plan").rows.filter((r) => !r.decision.includes("user"));
	const tests = stateOf(state, "olko-tests");
	const branch = `feat/claude-sync-${rows.map((r) => r.name.replace(/^olko-/, "")).join("-").slice(0, 40).replace(/-+$/, "")}`;
	const git = async (...args) => {
		const res = await exec("git", [
			"-C",
			olko,
			...args
		]);
		if (res.code !== 0) throw new Error(`git ${args[0]} failed: ${(res.stderr || res.stdout).trim()}`);
		return res.stdout.trim();
	};
	await git("checkout", "-b", branch);
	await git("add", "--", ...changed);
	const subject = `feat(sync): port ${rows.map((r) => `${r.name} ${r.version}`).join(", ")}`;
	await git("commit", "-m", subject);
	await git("push", "-u", "origin", branch);
	const pr = await exec("gh", [
		"pr",
		"create",
		"--draft",
		"--head",
		branch,
		"--base",
		"main",
		"--title",
		subject,
		"--body",
		[`Artifacts: ${rows.map((r) => `${r.name} ${r.version} (${r.decision})`).join(", ")}`, `Validation: ${tests.passed ? "node tests pass" : "node tests FAIL"} ${tests.summary}`].join("\n\n")
	], { cwd: olko });
	if (pr.code !== 0) throw new Error(`gh pr create failed: ${(pr.stderr || pr.stdout).trim()}`);
	const url = pr.stdout.trim().split(/\r?\n/).at(-1);
	return {
		state: { publish: {
			url,
			branch,
			commit: await git("rev-parse", "HEAD")
		} },
		metrics: { prs: 1 },
		output: `Draft PR ${url} on ${branch}.`
	};
};
var claudeSyncConsolidationRecord = async ({ state, exec, answers }) => {
	if (!exec) throw new Error("csync.consolidationRecord needs the host exec tool");
	const { stateDir } = stateOf(state, "state");
	const suggestions = Object.values(stateOf(state, "consolidate"))[0]?.suggestions ?? [];
	const accepted = [];
	const rejected = [];
	for (const [i, s] of suggestions.entries()) {
		const answer = answers?.[`q-claude-sync-suggestion-${i}`];
		if (answer === "reject") {
			await syncState(exec, stateDir, [
				"rejection",
				"add",
				"--items",
				s.items.join(","),
				"--suggestion",
				s.verdict,
				"--reason",
				answers?.[`q-claude-sync-suggestion-reason-${i}`] ?? "declined"
			]);
			rejected.push(s.items.join(","));
		} else if (answer === "accept") accepted.push(`- ${s.verdict}: ${s.items.join(", ")}\n  evidence: ${s.evidence}\n  loses: ${s.loses}`);
	}
	const planFile = path.join(stateDir, `consolidation-plan-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.md`);
	if (accepted.length) fs.appendFileSync(planFile, `${accepted.join("\n")}\n`);
	return {
		state: {
			accepted: accepted.length,
			rejected: rejected.length,
			planFile: accepted.length ? planFile : "none"
		},
		metrics: {
			accepted: accepted.length,
			rejected: rejected.length
		},
		output: `Consolidation: ${accepted.length} accepted${accepted.length ? ` (plan ${planFile})` : ""}, ${rejected.length} rejected.`
	};
};
function parseSuggestions(text) {
	return { suggestions: (lastJsonBlock(text).suggestions ?? []).filter((s) => [
		"merge",
		"remove",
		"extend"
	].includes(s.verdict) && Array.isArray(s.items) && s.items.length >= 2).map((s, i) => ({
		...s,
		line: `${i + 1}. ${s.verdict}: ${s.items.join(" + ")} — ${s.evidence} — loses: ${s.loses}`
	})) };
}
function parseDraft(text) {
	const data = lastJsonBlock(text);
	return {
		questions: (data.questions ?? []).filter((q) => typeof q === "string" && q.trim()),
		feature: data.feature ?? null,
		tasks: data.tasks ?? [],
		text: String(data.text ?? "")
	};
}
function parseGrill(text) {
	const questions = lastJsonBlock(text).questions ?? [];
	for (const q of questions) if (!q.problem || !Array.isArray(q.options) || q.options.length !== 3) throw new Error(`grill question needs a problem and exactly 3 options: ${JSON.stringify(q).slice(0, 200)}`);
	return { questions };
}
function parseVerdictLine(prefix) {
	return (text) => {
		const line = String(text).split(/\r?\n/).map((l) => l.trim().replace(/^`+|`+$/g, "")).reverse().find((l) => l.startsWith(`${prefix} |`));
		if (!line) throw new Error(`output has no '${prefix} |' line`);
		const [, verdict = "", count = "0", detail = ""] = line.split("|").map((p) => p.trim());
		return {
			pass: verdict === "pass" || verdict === "yes" || verdict === "none",
			count: Number(count) || 0,
			detail
		};
	};
}
var planRoute = async ({ input, answers }) => {
	const route = input.route ?? answers?.["q-plan-route"];
	if (route && ![
		"discovery",
		"planning",
		"both"
	].includes(route)) throw new Error(`input.route must be discovery, planning or both, not ${route}`);
	return {
		state: { route: route ?? "ask" },
		metrics: {},
		output: `Route: ${route ?? "ask the user"}.`
	};
};
var planDraftCheck = async ({ state, answers, nodeId }) => {
	const draft = Object.values(stateOf(state, "draft"))[0];
	const previous = nodeId ? state[nodeId] : void 0;
	const round = (previous?.round ?? 0) + 1;
	const answer = previous ? answers?.[`q-plan-questions-${previous.round}`] ?? answers?.[`q-plan-revise-${previous.round}`] : void 0;
	const answered = [previous?.answered, answer].filter(Boolean).join("\n\n");
	const ask = draft.questions.length > 0 && round <= 3;
	return {
		state: {
			round,
			ask,
			questions: draft.questions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
			answered: answered || "none yet",
			draft
		},
		metrics: {
			questions: draft.questions.length,
			round
		},
		output: ask ? `Draft round ${round}: ${draft.questions.length} open questions.` : `Draft ready: ${draft.tasks.length} Tasks.`
	};
};
var planFeature = async ({ state, input, cwd }) => {
	const fromTracker = state["tracker-context/context"];
	const draft = (fromTracker && Object.values(fromTracker)[0]) ?? state["draft-check"]?.draft;
	if (!draft) throw new Error("no Feature context: give input.route planning with the tracker on, or run the discovery draft first");
	const missing = draft.tasks.filter((t) => !t.criteria?.length).map((t) => t.id);
	if (!draft.tasks.length) throw new Error("entry gate: the Feature has no child Tasks; route to the backlog writer draft first");
	if (missing.length) throw new Error(`entry gate: Tasks without acceptance criteria: ${missing.join(", ")}; never plan from a guessed criterion`);
	const featureId = input.featureId ?? (draft.feature?.title ?? "feature").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
	const featureDir = `plans/features/${featureId}`;
	fs.mkdirSync(path.join(cwd ?? ".", featureDir, "tasks"), { recursive: true });
	const tasks = draft.tasks.map((t) => `- ${t.id}: ${t.title}\n${t.criteria.map((c) => `  - ${c}`).join("\n")}`).join("\n");
	const criteria = [...draft.feature?.criteria ?? [], ...draft.tasks.flatMap((t) => t.criteria)].join("\n");
	return {
		state: {
			featureId,
			featureDir,
			text: draft.text,
			tasks,
			taskIds: draft.tasks.map((t) => t.id),
			criteria
		},
		metrics: { tasks: draft.tasks.length },
		output: `Feature ${featureId}: ${draft.tasks.length} Tasks with acceptance criteria; plan folder ${featureDir}.`
	};
};
var AUDITORS = [
	[/\.net|c#|csproj|asp\.net/i, "olko-dotnet-auditor"],
	[/kotlin|android/i, "olko-mobile-auditor"],
	[/react native|expo/i, "olko-react-native-auditor"],
	[/\breact\b(?! native)/i, "olko-react-auditor"],
	[/army python|python army/i, "olko-army-python-auditor"]
];
var planAuditors = async ({ state, cwd }) => {
	const { featureDir } = stateOf(state, "feature");
	const file = path.join(cwd ?? ".", featureDir, "implementation.md");
	const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
	const scope = text.split(/^## /m).find((s) => /^(implementation scope|scope|technical scope)/i.test(s)) ?? text;
	const agents = AUDITORS.filter(([re]) => re.test(scope)).map(([, agent]) => ({
		id: agent.replace(/^olko-|-auditor$/g, ""),
		agentName: agent
	}));
	return {
		state: { agents },
		metrics: { auditors: agents.length },
		output: agents.length ? `Auditors for the planned technologies: ${agents.map((a) => a.agentName).join(", ")}.` : "No stack auditor matches the planned technologies; audits skipped."
	};
};
var planFindings = async ({ state, args }) => {
	const from = String(args.from);
	const results = Object.entries(state[from] ?? {});
	const total = results.reduce((sum, [, r]) => sum + r.count, 0);
	return {
		state: {
			total,
			text: results.filter(([, r]) => r.count > 0).map(([id, r]) => `${id}: ${r.detail}`).join("\n") || "none"
		},
		metrics: { findings: total },
		output: total ? `${total} findings to fold from ${from}.` : `No findings from ${from}.`
	};
};
var planFiles = async ({ state, cwd }) => {
	const { featureDir, criteria } = stateOf(state, "feature");
	const root = path.join(cwd ?? ".", featureDir);
	const tasks = fs.existsSync(path.join(root, "tasks")) ? fs.readdirSync(path.join(root, "tasks")).filter((f) => f.endsWith("-implementation.md")).sort().map((f) => `${featureDir}/tasks/${f}`) : [];
	const files = [`${featureDir}/implementation.md`, ...tasks].map((p) => ({
		path: p,
		criteria
	}));
	return {
		state: { files },
		metrics: { files: files.length },
		output: `${files.length} plan files to review.`
	};
};
var planReviewCollect = async ({ state, nodeId }) => {
	const previous = nodeId ? state[nodeId] : void 0;
	const report = state["plan-review"]?.["plan-report"];
	const file = state["plan-next"]?.item?.path ?? "?";
	const lines = (report?.kept ?? []).map((f) => f.line);
	const reports = [...previous?.reports ?? [], ...lines.map((l) => `${file}: ${l}`)];
	return {
		state: {
			reports,
			confirmed: reports.length,
			text: reports.join("\n") || "none"
		},
		metrics: { confirmed: reports.length },
		output: `${lines.length} confirmed plan findings for ${file}.`
	};
};
var planGrillQuestions = async ({ state, nodeId }) => {
	const parsed = Object.values(stateOf(state, "grill"))[0];
	const round = ((nodeId ? state[nodeId] : void 0)?.round ?? 0) + 1;
	const questions = parsed.questions.map((q, i) => ({
		index: i,
		text: [
			`Problem: ${q.problem}`,
			`Why I am asking: ${q.why}`,
			...q.options.map((o, n) => `${n + 1}. ${o.label}${n === 0 ? " (recommended)" : ""}\n   Business: ${o.business}\n   Change scope: ${o.scope}`),
			q.glossary ? `Glossary: ${q.glossary}` : ""
		].filter(Boolean).join("\n")
	}));
	const count = round <= 3 ? questions.length : 0;
	return {
		state: {
			round,
			questions,
			count
		},
		metrics: {
			questions: questions.length,
			round
		},
		output: count ? `Grill round ${round}: ${count} questions as one batch.` : `Grill round ${round}: no open question${questions.length ? " (round limit reached; the rest stays in Open items)" : ""}.`
	};
};
var planAnswers = async ({ state, answers, args }) => {
	const from = String(args.from);
	const prefix = String(args.prefix);
	const source = stateOf(state, from);
	const lines = source.questions.map((q) => `Question ${q.index + 1}:\n${q.text}\nAnswer: ${answers?.[`${prefix}${source.round}-${q.index}`] ?? "unanswered"}`);
	return {
		state: {
			text: lines.join("\n\n") || "none",
			count: lines.length
		},
		metrics: { answers: lines.length },
		output: `${lines.length} answers collected.`
	};
};
var planReadiness = async ({ state, nodeId }) => {
	const parsed = Object.values(stateOf(state, "readiness"))[0];
	const round = ((nodeId ? state[nodeId] : void 0)?.round ?? 0) + 1;
	const questions = parsed.questions.map((q, i) => ({
		index: i,
		text: [
			`Blocker: ${q.problem}`,
			`Why I am asking: ${q.why}`,
			...q.options.map((o, n) => `${n + 1}. ${o.label}${n === 0 ? " (recommended)" : ""}\n   Business: ${o.business}\n   Change scope: ${o.scope}`)
		].join("\n")
	}));
	return {
		state: {
			round,
			questions,
			count: round <= 3 ? questions.length : 0
		},
		metrics: {
			blockers: questions.length,
			round
		},
		output: questions.length ? `Readiness round ${round}: ${questions.length} blockers.` : "Ready for implementation: no blockers."
	};
};
var planOpenEditor = async ({ state, exec, cwd }) => {
	const { featureDir } = stateOf(state, "feature");
	const res = exec ? await exec("code", ["-n", featureDir], { cwd: cwd ?? "." }) : {
		code: -1,
		stdout: "",
		stderr: "no exec"
	};
	return {
		state: { opened: res.code === 0 },
		metrics: { opened: res.code === 0 ? 1 : 0 },
		output: res.code === 0 ? `Opened ${featureDir} in VS Code.` : `Could not open VS Code; run: code -n ${featureDir}`
	};
};
var planScopeCheck = async ({ state, exec, cwd }) => {
	if (!exec) throw new Error("plan.scopeCheck needs the host exec tool");
	const { featureDir } = stateOf(state, "feature");
	const status = (await exec("git", [
		"-C",
		cwd ?? ".",
		"status",
		"--porcelain",
		"--untracked-files=all"
	])).stdout.split(/\r?\n/).filter(Boolean).map((l) => l.slice(3).trim());
	const allowed = (p) => p.startsWith(`${featureDir}/`) || p === ".opencode/memory/olko-plan-documentation-orchestrator.md";
	const outside = status.filter((p) => !allowed(p));
	if (outside.length) throw new Error(`planning changed files outside the plan folder: ${outside.join(", ")}`);
	return {
		state: { changed: status },
		metrics: { changed: status.length },
		output: `Plan scope check passed: ${status.length} changed files, all under ${featureDir}.`
	};
};
var planFeatureReport = async ({ state, cwd }) => {
	const { featureDir, featureId } = stateOf(state, "feature");
	const root = path.join(cwd ?? ".", featureDir);
	const tasks = fs.existsSync(path.join(root, "tasks")) ? fs.readdirSync(path.join(root, "tasks")).filter((f) => f.endsWith("-implementation.md")) : [];
	const ready = fs.existsSync(path.join(root, "implementation.md")) ? fs.readFileSync(path.join(root, "implementation.md"), "utf8").match(/Ready for implementation:\s*(yes|no)/i)?.[1] ?? "missing" : "missing";
	const auditors = state.auditors?.agents?.map((a) => a.agentName) ?? [];
	const review = state["plan-collect"]?.confirmed ?? 0;
	return {
		state: { ready },
		metrics: { tasks: tasks.length },
		output: [
			`Feature plan ${featureId}`,
			`Files: ${[
				"business.md",
				"implementation.md",
				"stack.md",
				"tracker.md"
			].map((f) => `${featureDir}/${f}`).join(", ")}`,
			`Task plans: ${tasks.map((t) => `${featureDir}/tasks/${t}`).join(", ") || "none"}`,
			`Ready for implementation: ${ready}`,
			`Auditors: ${auditors.join(", ") || "none (no matching technology)"}`,
			`Plan review: ${review} confirmed findings folded`,
			"Domain changes: write-free recommendation in business.md; vault changes stay approval-gated after implementation."
		].join("\n")
	};
};
var OPERATIONS = {
	...IMPL_OPERATIONS,
	"builtin.pass": pass,
	"builtin.count": async ({ state, nodeId }) => {
		const count = ((nodeId ? state[nodeId]?.count : 0) ?? 0) + 1;
		return {
			state: { count },
			metrics: { count },
			output: `Round ${count}.`
		};
	},
	"builtin.stop": async ({ args }) => {
		throw new Error(String(args.reason ?? "stopped by the user"));
	},
	"plan.route": planRoute,
	"plan.draftCheck": planDraftCheck,
	"plan.feature": planFeature,
	"plan.auditors": planAuditors,
	"plan.findings": planFindings,
	"plan.files": planFiles,
	"plan.reviewCollect": planReviewCollect,
	"plan.grillQuestions": planGrillQuestions,
	"plan.answers": planAnswers,
	"plan.readiness": planReadiness,
	"plan.openEditor": planOpenEditor,
	"plan.scopeCheck": planScopeCheck,
	"plan.report": planFeatureReport,
	"builtin.values": async ({ args }) => {
		if (!Array.isArray(args.values)) throw new Error("with.values must be a list");
		return {
			state: { values: args.values },
			metrics: { values: args.values.length },
			output: `${args.values.length} values.`
		};
	},
	"builtin.gate": async ({ state, input, args }) => {
		const when = String(args.when);
		const enabled = evaluateWhen(when, {
			...state,
			input,
			switches: input.switches ?? {}
		});
		return {
			state: { enabled },
			metrics: { enabled: enabled ? 1 : 0 },
			output: enabled ? `Subgraph ${String(args.subgraph)} runs (${when}).` : `Subgraph ${String(args.subgraph)} skipped: switch off (${when} is false).`
		};
	},
	"github.prScope": prScope,
	"github.postComment": postComment,
	"list.next": listNext,
	"plan.read": planRead,
	"review.planReport": planReport,
	"github.prFeedback": prFeedback,
	"github.postReply": postReply,
	"feedback.plan": feedbackPlan,
	"feedback.report": feedbackReport,
	"feedback.fixNotAvailable": async () => {
		throw new Error("Fixing code from review comments needs write-capable agents in the factory (docs/yaml-migration-plan.md, E9). The decisions are recorded in this run; nothing was changed.");
	},
	"memory.load": memoryLoad,
	"memory.persist": memoryPersist,
	"review.route": reviewRoute,
	"review.detectLenses": detectLenses,
	"review.mergeFindings": mergeFindings,
	"review.confirmFindings": confirmFindings,
	"review.mergeRules": mergeRules,
	"review.addViolations": addViolations,
	"review.rankFindings": rankFindings,
	"sync.resolvePath": resolveMarketplacePath,
	"sync.safeSource": safeSource,
	"sync.discover": discoverArtifacts,
	"sync.checkVersions": checkSkillVersions,
	"sync.rows": syncRows,
	"sync.plan": syncPlanApply,
	"sync.revertLocal": revertLocal,
	"sync.validate": validateMarketplace,
	"sync.prOf": prOf,
	"sync.waitChecks": waitForChecks,
	"sync.merge": squashMerge,
	"sync.install": installArtifacts,
	"sync.memorySave": syncMemorySave,
	"csync.state": claudeSyncState,
	"csync.leakSave": claudeSyncLeakSave,
	"csync.inventories": claudeSyncInventories,
	"csync.capabilities": claudeSyncCapabilities,
	"csync.select": claudeSyncSelect,
	"csync.exclusions": claudeSyncExclusions,
	"csync.rows": claudeSyncRows,
	"csync.plan": claudeSyncPlan,
	"csync.record": claudeSyncRecord,
	"csync.report": claudeSyncReport,
	"csync.stagePlan": claudeSyncStagePlan,
	"csync.findings": claudeSyncFindings,
	"csync.fixes": claudeSyncFixes,
	"csync.applyPlan": claudeSyncApplyPlan,
	"csync.moreDeps": claudeSyncMoreDeps,
	"csync.applyOlko": claudeSyncApplyOlko,
	"csync.applyUser": claudeSyncApplyUser,
	"csync.applyRecord": claudeSyncApplyRecord,
	"csync.olkoTests": claudeSyncOlkoTests,
	"csync.leakCheck": claudeSyncLeakCheck,
	"csync.publish": claudeSyncPublish,
	"csync.consolidationRecord": claudeSyncConsolidationRecord,
	"sync.report": syncReport,
	"sync.stopUnsafe": async ({ state, args, input }) => {
		const source = stateOf(state, typeof args.from === "string" ? args.from : "safe-source");
		throw new Error(`Sync stopped before any comparison: ${input.label ?? "the marketplace"} checkout is not safe: ${source.detail ?? "unknown reason"}.`);
	}
};
var PARSERS = {
	...IMPL_PARSERS,
	"text.raw": (text) => String(text).trim(),
	"review.findings": parseFindings,
	"review.verdicts": parseVerdicts,
	"review.rulesCheck": parseRulesCheck,
	"sync.comparison": parseComparison,
	"sync.prLine": parsePrLine,
	"sync.applied": parseApplied,
	"csync.capabilities": parseCapabilities,
	"csync.inventory": parseInventory,
	"csync.verdict": parseVerdict,
	"csync.staged": parseStaged,
	"plan.draft": parseDraft,
	"plan.grill": parseGrill,
	"plan.consistency": parseVerdictLine("consistency"),
	"plan.findings": parseVerdictLine("findings"),
	"csync.suggestions": parseSuggestions
};
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/codegen/code.js
var require_code$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.regexpCode = exports.getEsmExportName = exports.getProperty = exports.safeStringify = exports.stringify = exports.strConcat = exports.addCodeArg = exports.str = exports._ = exports.nil = exports._Code = exports.Name = exports.IDENTIFIER = exports._CodeOrName = void 0;
	var _CodeOrName = class {};
	exports._CodeOrName = _CodeOrName;
	exports.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
	var Name = class extends _CodeOrName {
		constructor(s) {
			super();
			if (!exports.IDENTIFIER.test(s)) throw new Error("CodeGen: name must be a valid identifier");
			this.str = s;
		}
		toString() {
			return this.str;
		}
		emptyStr() {
			return false;
		}
		get names() {
			return { [this.str]: 1 };
		}
	};
	exports.Name = Name;
	var _Code = class extends _CodeOrName {
		constructor(code) {
			super();
			this._items = typeof code === "string" ? [code] : code;
		}
		toString() {
			return this.str;
		}
		emptyStr() {
			if (this._items.length > 1) return false;
			const item = this._items[0];
			return item === "" || item === "\"\"";
		}
		get str() {
			var _a;
			return (_a = this._str) !== null && _a !== void 0 ? _a : this._str = this._items.reduce((s, c) => `${s}${c}`, "");
		}
		get names() {
			var _a;
			return (_a = this._names) !== null && _a !== void 0 ? _a : this._names = this._items.reduce((names, c) => {
				if (c instanceof Name) names[c.str] = (names[c.str] || 0) + 1;
				return names;
			}, {});
		}
	};
	exports._Code = _Code;
	exports.nil = new _Code("");
	function _(strs, ...args) {
		const code = [strs[0]];
		let i = 0;
		while (i < args.length) {
			addCodeArg(code, args[i]);
			code.push(strs[++i]);
		}
		return new _Code(code);
	}
	exports._ = _;
	var plus = new _Code("+");
	function str(strs, ...args) {
		const expr = [safeStringify(strs[0])];
		let i = 0;
		while (i < args.length) {
			expr.push(plus);
			addCodeArg(expr, args[i]);
			expr.push(plus, safeStringify(strs[++i]));
		}
		optimize(expr);
		return new _Code(expr);
	}
	exports.str = str;
	function addCodeArg(code, arg) {
		if (arg instanceof _Code) code.push(...arg._items);
		else if (arg instanceof Name) code.push(arg);
		else code.push(interpolate(arg));
	}
	exports.addCodeArg = addCodeArg;
	function optimize(expr) {
		let i = 1;
		while (i < expr.length - 1) {
			if (expr[i] === plus) {
				const res = mergeExprItems(expr[i - 1], expr[i + 1]);
				if (res !== void 0) {
					expr.splice(i - 1, 3, res);
					continue;
				}
				expr[i++] = "+";
			}
			i++;
		}
	}
	function mergeExprItems(a, b) {
		if (b === "\"\"") return a;
		if (a === "\"\"") return b;
		if (typeof a == "string") {
			if (b instanceof Name || a[a.length - 1] !== "\"") return;
			if (typeof b != "string") return `${a.slice(0, -1)}${b}"`;
			if (b[0] === "\"") return a.slice(0, -1) + b.slice(1);
			return;
		}
		if (typeof b == "string" && b[0] === "\"" && !(a instanceof Name)) return `"${a}${b.slice(1)}`;
	}
	function strConcat(c1, c2) {
		return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str`${c1}${c2}`;
	}
	exports.strConcat = strConcat;
	function interpolate(x) {
		return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
	}
	function stringify(x) {
		return new _Code(safeStringify(x));
	}
	exports.stringify = stringify;
	function safeStringify(x) {
		return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
	}
	exports.safeStringify = safeStringify;
	function getProperty(key) {
		return typeof key == "string" && exports.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
	}
	exports.getProperty = getProperty;
	function getEsmExportName(key) {
		if (typeof key == "string" && exports.IDENTIFIER.test(key)) return new _Code(`${key}`);
		throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
	}
	exports.getEsmExportName = getEsmExportName;
	function regexpCode(rx) {
		return new _Code(rx.toString());
	}
	exports.regexpCode = regexpCode;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/codegen/scope.js
var require_scope = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ValueScope = exports.ValueScopeName = exports.Scope = exports.varKinds = exports.UsedValueState = void 0;
	var code_1 = require_code$1();
	var ValueError = class extends Error {
		constructor(name) {
			super(`CodeGen: "code" for ${name} not defined`);
			this.value = name.value;
		}
	};
	var UsedValueState;
	(function(UsedValueState) {
		UsedValueState[UsedValueState["Started"] = 0] = "Started";
		UsedValueState[UsedValueState["Completed"] = 1] = "Completed";
	})(UsedValueState || (exports.UsedValueState = UsedValueState = {}));
	exports.varKinds = {
		const: new code_1.Name("const"),
		let: new code_1.Name("let"),
		var: new code_1.Name("var")
	};
	var Scope = class {
		constructor({ prefixes, parent } = {}) {
			this._names = {};
			this._prefixes = prefixes;
			this._parent = parent;
		}
		toName(nameOrPrefix) {
			return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
		}
		name(prefix) {
			return new code_1.Name(this._newName(prefix));
		}
		_newName(prefix) {
			const ng = this._names[prefix] || this._nameGroup(prefix);
			return `${prefix}${ng.index++}`;
		}
		_nameGroup(prefix) {
			var _a, _b;
			if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
			return this._names[prefix] = {
				prefix,
				index: 0
			};
		}
	};
	exports.Scope = Scope;
	var ValueScopeName = class extends code_1.Name {
		constructor(prefix, nameStr) {
			super(nameStr);
			this.prefix = prefix;
		}
		setValue(value, { property, itemIndex }) {
			this.value = value;
			this.scopePath = (0, code_1._)`.${new code_1.Name(property)}[${itemIndex}]`;
		}
	};
	exports.ValueScopeName = ValueScopeName;
	var line = (0, code_1._)`\n`;
	var ValueScope = class extends Scope {
		constructor(opts) {
			super(opts);
			this._values = {};
			this._scope = opts.scope;
			this.opts = {
				...opts,
				_n: opts.lines ? line : code_1.nil
			};
		}
		get() {
			return this._scope;
		}
		name(prefix) {
			return new ValueScopeName(prefix, this._newName(prefix));
		}
		value(nameOrPrefix, value) {
			var _a;
			if (value.ref === void 0) throw new Error("CodeGen: ref must be passed in value");
			const name = this.toName(nameOrPrefix);
			const { prefix } = name;
			const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
			let vs = this._values[prefix];
			if (vs) {
				const _name = vs.get(valueKey);
				if (_name) return _name;
			} else vs = this._values[prefix] = /* @__PURE__ */ new Map();
			vs.set(valueKey, name);
			const s = this._scope[prefix] || (this._scope[prefix] = []);
			const itemIndex = s.length;
			s[itemIndex] = value.ref;
			name.setValue(value, {
				property: prefix,
				itemIndex
			});
			return name;
		}
		getValue(prefix, keyOrRef) {
			const vs = this._values[prefix];
			if (!vs) return;
			return vs.get(keyOrRef);
		}
		scopeRefs(scopeName, values = this._values) {
			return this._reduceValues(values, (name) => {
				if (name.scopePath === void 0) throw new Error(`CodeGen: name "${name}" has no value`);
				return (0, code_1._)`${scopeName}${name.scopePath}`;
			});
		}
		scopeCode(values = this._values, usedValues, getCode) {
			return this._reduceValues(values, (name) => {
				if (name.value === void 0) throw new Error(`CodeGen: name "${name}" has no value`);
				return name.value.code;
			}, usedValues, getCode);
		}
		_reduceValues(values, valueCode, usedValues = {}, getCode) {
			let code = code_1.nil;
			for (const prefix in values) {
				const vs = values[prefix];
				if (!vs) continue;
				const nameSet = usedValues[prefix] = usedValues[prefix] || /* @__PURE__ */ new Map();
				vs.forEach((name) => {
					if (nameSet.has(name)) return;
					nameSet.set(name, UsedValueState.Started);
					let c = valueCode(name);
					if (c) {
						const def = this.opts.es5 ? exports.varKinds.var : exports.varKinds.const;
						code = (0, code_1._)`${code}${def} ${name} = ${c};${this.opts._n}`;
					} else if (c = getCode === null || getCode === void 0 ? void 0 : getCode(name)) code = (0, code_1._)`${code}${c}${this.opts._n}`;
					else throw new ValueError(name);
					nameSet.set(name, UsedValueState.Completed);
				});
			}
			return code;
		}
	};
	exports.ValueScope = ValueScope;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/codegen/index.js
var require_codegen = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.or = exports.and = exports.not = exports.CodeGen = exports.operators = exports.varKinds = exports.ValueScopeName = exports.ValueScope = exports.Scope = exports.Name = exports.regexpCode = exports.stringify = exports.getProperty = exports.nil = exports.strConcat = exports.str = exports._ = void 0;
	var code_1 = require_code$1();
	var scope_1 = require_scope();
	var code_2 = require_code$1();
	Object.defineProperty(exports, "_", {
		enumerable: true,
		get: function() {
			return code_2._;
		}
	});
	Object.defineProperty(exports, "str", {
		enumerable: true,
		get: function() {
			return code_2.str;
		}
	});
	Object.defineProperty(exports, "strConcat", {
		enumerable: true,
		get: function() {
			return code_2.strConcat;
		}
	});
	Object.defineProperty(exports, "nil", {
		enumerable: true,
		get: function() {
			return code_2.nil;
		}
	});
	Object.defineProperty(exports, "getProperty", {
		enumerable: true,
		get: function() {
			return code_2.getProperty;
		}
	});
	Object.defineProperty(exports, "stringify", {
		enumerable: true,
		get: function() {
			return code_2.stringify;
		}
	});
	Object.defineProperty(exports, "regexpCode", {
		enumerable: true,
		get: function() {
			return code_2.regexpCode;
		}
	});
	Object.defineProperty(exports, "Name", {
		enumerable: true,
		get: function() {
			return code_2.Name;
		}
	});
	var scope_2 = require_scope();
	Object.defineProperty(exports, "Scope", {
		enumerable: true,
		get: function() {
			return scope_2.Scope;
		}
	});
	Object.defineProperty(exports, "ValueScope", {
		enumerable: true,
		get: function() {
			return scope_2.ValueScope;
		}
	});
	Object.defineProperty(exports, "ValueScopeName", {
		enumerable: true,
		get: function() {
			return scope_2.ValueScopeName;
		}
	});
	Object.defineProperty(exports, "varKinds", {
		enumerable: true,
		get: function() {
			return scope_2.varKinds;
		}
	});
	exports.operators = {
		GT: new code_1._Code(">"),
		GTE: new code_1._Code(">="),
		LT: new code_1._Code("<"),
		LTE: new code_1._Code("<="),
		EQ: new code_1._Code("==="),
		NEQ: new code_1._Code("!=="),
		NOT: new code_1._Code("!"),
		OR: new code_1._Code("||"),
		AND: new code_1._Code("&&"),
		ADD: new code_1._Code("+")
	};
	var Node = class {
		optimizeNodes() {
			return this;
		}
		optimizeNames(_names, _constants) {
			return this;
		}
	};
	var Def = class extends Node {
		constructor(varKind, name, rhs) {
			super();
			this.varKind = varKind;
			this.name = name;
			this.rhs = rhs;
		}
		render({ es5, _n }) {
			const varKind = es5 ? scope_1.varKinds.var : this.varKind;
			const rhs = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
			return `${varKind} ${this.name}${rhs};` + _n;
		}
		optimizeNames(names, constants) {
			if (!names[this.name.str]) return;
			if (this.rhs) this.rhs = optimizeExpr(this.rhs, names, constants);
			return this;
		}
		get names() {
			return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
		}
	};
	var Assign = class extends Node {
		constructor(lhs, rhs, sideEffects) {
			super();
			this.lhs = lhs;
			this.rhs = rhs;
			this.sideEffects = sideEffects;
		}
		render({ _n }) {
			return `${this.lhs} = ${this.rhs};` + _n;
		}
		optimizeNames(names, constants) {
			if (this.lhs instanceof code_1.Name && !names[this.lhs.str] && !this.sideEffects) return;
			this.rhs = optimizeExpr(this.rhs, names, constants);
			return this;
		}
		get names() {
			return addExprNames(this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names }, this.rhs);
		}
	};
	var AssignOp = class extends Assign {
		constructor(lhs, op, rhs, sideEffects) {
			super(lhs, rhs, sideEffects);
			this.op = op;
		}
		render({ _n }) {
			return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
		}
	};
	var Label = class extends Node {
		constructor(label) {
			super();
			this.label = label;
			this.names = {};
		}
		render({ _n }) {
			return `${this.label}:` + _n;
		}
	};
	var Break = class extends Node {
		constructor(label) {
			super();
			this.label = label;
			this.names = {};
		}
		render({ _n }) {
			return `break${this.label ? ` ${this.label}` : ""};` + _n;
		}
	};
	var Throw = class extends Node {
		constructor(error) {
			super();
			this.error = error;
		}
		render({ _n }) {
			return `throw ${this.error};` + _n;
		}
		get names() {
			return this.error.names;
		}
	};
	var AnyCode = class extends Node {
		constructor(code) {
			super();
			this.code = code;
		}
		render({ _n }) {
			return `${this.code};` + _n;
		}
		optimizeNodes() {
			return `${this.code}` ? this : void 0;
		}
		optimizeNames(names, constants) {
			this.code = optimizeExpr(this.code, names, constants);
			return this;
		}
		get names() {
			return this.code instanceof code_1._CodeOrName ? this.code.names : {};
		}
	};
	var ParentNode = class extends Node {
		constructor(nodes = []) {
			super();
			this.nodes = nodes;
		}
		render(opts) {
			return this.nodes.reduce((code, n) => code + n.render(opts), "");
		}
		optimizeNodes() {
			const { nodes } = this;
			let i = nodes.length;
			while (i--) {
				const n = nodes[i].optimizeNodes();
				if (Array.isArray(n)) nodes.splice(i, 1, ...n);
				else if (n) nodes[i] = n;
				else nodes.splice(i, 1);
			}
			return nodes.length > 0 ? this : void 0;
		}
		optimizeNames(names, constants) {
			const { nodes } = this;
			let i = nodes.length;
			while (i--) {
				const n = nodes[i];
				if (n.optimizeNames(names, constants)) continue;
				subtractNames(names, n.names);
				nodes.splice(i, 1);
			}
			return nodes.length > 0 ? this : void 0;
		}
		get names() {
			return this.nodes.reduce((names, n) => addNames(names, n.names), {});
		}
	};
	var BlockNode = class extends ParentNode {
		render(opts) {
			return "{" + opts._n + super.render(opts) + "}" + opts._n;
		}
	};
	var Root = class extends ParentNode {};
	var Else = class extends BlockNode {};
	Else.kind = "else";
	var If = class If extends BlockNode {
		constructor(condition, nodes) {
			super(nodes);
			this.condition = condition;
		}
		render(opts) {
			let code = `if(${this.condition})` + super.render(opts);
			if (this.else) code += "else " + this.else.render(opts);
			return code;
		}
		optimizeNodes() {
			super.optimizeNodes();
			const cond = this.condition;
			if (cond === true) return this.nodes;
			let e = this.else;
			if (e) {
				const ns = e.optimizeNodes();
				e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
			}
			if (e) {
				if (cond === false) return e instanceof If ? e : e.nodes;
				if (this.nodes.length) return this;
				return new If(not(cond), e instanceof If ? [e] : e.nodes);
			}
			if (cond === false || !this.nodes.length) return void 0;
			return this;
		}
		optimizeNames(names, constants) {
			var _a;
			this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
			if (!(super.optimizeNames(names, constants) || this.else)) return;
			this.condition = optimizeExpr(this.condition, names, constants);
			return this;
		}
		get names() {
			const names = super.names;
			addExprNames(names, this.condition);
			if (this.else) addNames(names, this.else.names);
			return names;
		}
	};
	If.kind = "if";
	var For = class extends BlockNode {};
	For.kind = "for";
	var ForLoop = class extends For {
		constructor(iteration) {
			super();
			this.iteration = iteration;
		}
		render(opts) {
			return `for(${this.iteration})` + super.render(opts);
		}
		optimizeNames(names, constants) {
			if (!super.optimizeNames(names, constants)) return;
			this.iteration = optimizeExpr(this.iteration, names, constants);
			return this;
		}
		get names() {
			return addNames(super.names, this.iteration.names);
		}
	};
	var ForRange = class extends For {
		constructor(varKind, name, from, to) {
			super();
			this.varKind = varKind;
			this.name = name;
			this.from = from;
			this.to = to;
		}
		render(opts) {
			const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
			const { name, from, to } = this;
			return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
		}
		get names() {
			return addExprNames(addExprNames(super.names, this.from), this.to);
		}
	};
	var ForIter = class extends For {
		constructor(loop, varKind, name, iterable) {
			super();
			this.loop = loop;
			this.varKind = varKind;
			this.name = name;
			this.iterable = iterable;
		}
		render(opts) {
			return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
		}
		optimizeNames(names, constants) {
			if (!super.optimizeNames(names, constants)) return;
			this.iterable = optimizeExpr(this.iterable, names, constants);
			return this;
		}
		get names() {
			return addNames(super.names, this.iterable.names);
		}
	};
	var Func = class extends BlockNode {
		constructor(name, args, async) {
			super();
			this.name = name;
			this.args = args;
			this.async = async;
		}
		render(opts) {
			return `${this.async ? "async " : ""}function ${this.name}(${this.args})` + super.render(opts);
		}
	};
	Func.kind = "func";
	var Return = class extends ParentNode {
		render(opts) {
			return "return " + super.render(opts);
		}
	};
	Return.kind = "return";
	var Try = class extends BlockNode {
		render(opts) {
			let code = "try" + super.render(opts);
			if (this.catch) code += this.catch.render(opts);
			if (this.finally) code += this.finally.render(opts);
			return code;
		}
		optimizeNodes() {
			var _a, _b;
			super.optimizeNodes();
			(_a = this.catch) === null || _a === void 0 || _a.optimizeNodes();
			(_b = this.finally) === null || _b === void 0 || _b.optimizeNodes();
			return this;
		}
		optimizeNames(names, constants) {
			var _a, _b;
			super.optimizeNames(names, constants);
			(_a = this.catch) === null || _a === void 0 || _a.optimizeNames(names, constants);
			(_b = this.finally) === null || _b === void 0 || _b.optimizeNames(names, constants);
			return this;
		}
		get names() {
			const names = super.names;
			if (this.catch) addNames(names, this.catch.names);
			if (this.finally) addNames(names, this.finally.names);
			return names;
		}
	};
	var Catch = class extends BlockNode {
		constructor(error) {
			super();
			this.error = error;
		}
		render(opts) {
			return `catch(${this.error})` + super.render(opts);
		}
	};
	Catch.kind = "catch";
	var Finally = class extends BlockNode {
		render(opts) {
			return "finally" + super.render(opts);
		}
	};
	Finally.kind = "finally";
	var CodeGen = class {
		constructor(extScope, opts = {}) {
			this._values = {};
			this._blockStarts = [];
			this._constants = {};
			this.opts = {
				...opts,
				_n: opts.lines ? "\n" : ""
			};
			this._extScope = extScope;
			this._scope = new scope_1.Scope({ parent: extScope });
			this._nodes = [new Root()];
		}
		toString() {
			return this._root.render(this.opts);
		}
		name(prefix) {
			return this._scope.name(prefix);
		}
		scopeName(prefix) {
			return this._extScope.name(prefix);
		}
		scopeValue(prefixOrName, value) {
			const name = this._extScope.value(prefixOrName, value);
			(this._values[name.prefix] || (this._values[name.prefix] = /* @__PURE__ */ new Set())).add(name);
			return name;
		}
		getScopeValue(prefix, keyOrRef) {
			return this._extScope.getValue(prefix, keyOrRef);
		}
		scopeRefs(scopeName) {
			return this._extScope.scopeRefs(scopeName, this._values);
		}
		scopeCode() {
			return this._extScope.scopeCode(this._values);
		}
		_def(varKind, nameOrPrefix, rhs, constant) {
			const name = this._scope.toName(nameOrPrefix);
			if (rhs !== void 0 && constant) this._constants[name.str] = rhs;
			this._leafNode(new Def(varKind, name, rhs));
			return name;
		}
		const(nameOrPrefix, rhs, _constant) {
			return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
		}
		let(nameOrPrefix, rhs, _constant) {
			return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
		}
		var(nameOrPrefix, rhs, _constant) {
			return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
		}
		assign(lhs, rhs, sideEffects) {
			return this._leafNode(new Assign(lhs, rhs, sideEffects));
		}
		add(lhs, rhs) {
			return this._leafNode(new AssignOp(lhs, exports.operators.ADD, rhs));
		}
		code(c) {
			if (typeof c == "function") c();
			else if (c !== code_1.nil) this._leafNode(new AnyCode(c));
			return this;
		}
		object(...keyValues) {
			const code = ["{"];
			for (const [key, value] of keyValues) {
				if (code.length > 1) code.push(",");
				code.push(key);
				if (key !== value || this.opts.es5) {
					code.push(":");
					(0, code_1.addCodeArg)(code, value);
				}
			}
			code.push("}");
			return new code_1._Code(code);
		}
		if(condition, thenBody, elseBody) {
			this._blockNode(new If(condition));
			if (thenBody && elseBody) this.code(thenBody).else().code(elseBody).endIf();
			else if (thenBody) this.code(thenBody).endIf();
			else if (elseBody) throw new Error("CodeGen: \"else\" body without \"then\" body");
			return this;
		}
		elseIf(condition) {
			return this._elseNode(new If(condition));
		}
		else() {
			return this._elseNode(new Else());
		}
		endIf() {
			return this._endBlockNode(If, Else);
		}
		_for(node, forBody) {
			this._blockNode(node);
			if (forBody) this.code(forBody).endFor();
			return this;
		}
		for(iteration, forBody) {
			return this._for(new ForLoop(iteration), forBody);
		}
		forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
			const name = this._scope.toName(nameOrPrefix);
			return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
		}
		forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
			const name = this._scope.toName(nameOrPrefix);
			if (this.opts.es5) {
				const arr = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
				return this.forRange("_i", 0, (0, code_1._)`${arr}.length`, (i) => {
					this.var(name, (0, code_1._)`${arr}[${i}]`);
					forBody(name);
				});
			}
			return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
		}
		forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
			if (this.opts.ownProperties) return this.forOf(nameOrPrefix, (0, code_1._)`Object.keys(${obj})`, forBody);
			const name = this._scope.toName(nameOrPrefix);
			return this._for(new ForIter("in", varKind, name, obj), () => forBody(name));
		}
		endFor() {
			return this._endBlockNode(For);
		}
		label(label) {
			return this._leafNode(new Label(label));
		}
		break(label) {
			return this._leafNode(new Break(label));
		}
		return(value) {
			const node = new Return();
			this._blockNode(node);
			this.code(value);
			if (node.nodes.length !== 1) throw new Error("CodeGen: \"return\" should have one node");
			return this._endBlockNode(Return);
		}
		try(tryBody, catchCode, finallyCode) {
			if (!catchCode && !finallyCode) throw new Error("CodeGen: \"try\" without \"catch\" and \"finally\"");
			const node = new Try();
			this._blockNode(node);
			this.code(tryBody);
			if (catchCode) {
				const error = this.name("e");
				this._currNode = node.catch = new Catch(error);
				catchCode(error);
			}
			if (finallyCode) {
				this._currNode = node.finally = new Finally();
				this.code(finallyCode);
			}
			return this._endBlockNode(Catch, Finally);
		}
		throw(error) {
			return this._leafNode(new Throw(error));
		}
		block(body, nodeCount) {
			this._blockStarts.push(this._nodes.length);
			if (body) this.code(body).endBlock(nodeCount);
			return this;
		}
		endBlock(nodeCount) {
			const len = this._blockStarts.pop();
			if (len === void 0) throw new Error("CodeGen: not in self-balancing block");
			const toClose = this._nodes.length - len;
			if (toClose < 0 || nodeCount !== void 0 && toClose !== nodeCount) throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
			this._nodes.length = len;
			return this;
		}
		func(name, args = code_1.nil, async, funcBody) {
			this._blockNode(new Func(name, args, async));
			if (funcBody) this.code(funcBody).endFunc();
			return this;
		}
		endFunc() {
			return this._endBlockNode(Func);
		}
		optimize(n = 1) {
			while (n-- > 0) {
				this._root.optimizeNodes();
				this._root.optimizeNames(this._root.names, this._constants);
			}
		}
		_leafNode(node) {
			this._currNode.nodes.push(node);
			return this;
		}
		_blockNode(node) {
			this._currNode.nodes.push(node);
			this._nodes.push(node);
		}
		_endBlockNode(N1, N2) {
			const n = this._currNode;
			if (n instanceof N1 || N2 && n instanceof N2) {
				this._nodes.pop();
				return this;
			}
			throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
		}
		_elseNode(node) {
			const n = this._currNode;
			if (!(n instanceof If)) throw new Error("CodeGen: \"else\" without \"if\"");
			this._currNode = n.else = node;
			return this;
		}
		get _root() {
			return this._nodes[0];
		}
		get _currNode() {
			const ns = this._nodes;
			return ns[ns.length - 1];
		}
		set _currNode(node) {
			const ns = this._nodes;
			ns[ns.length - 1] = node;
		}
	};
	exports.CodeGen = CodeGen;
	function addNames(names, from) {
		for (const n in from) names[n] = (names[n] || 0) + (from[n] || 0);
		return names;
	}
	function addExprNames(names, from) {
		return from instanceof code_1._CodeOrName ? addNames(names, from.names) : names;
	}
	function optimizeExpr(expr, names, constants) {
		if (expr instanceof code_1.Name) return replaceName(expr);
		if (!canOptimize(expr)) return expr;
		return new code_1._Code(expr._items.reduce((items, c) => {
			if (c instanceof code_1.Name) c = replaceName(c);
			if (c instanceof code_1._Code) items.push(...c._items);
			else items.push(c);
			return items;
		}, []));
		function replaceName(n) {
			const c = constants[n.str];
			if (c === void 0 || names[n.str] !== 1) return n;
			delete names[n.str];
			return c;
		}
		function canOptimize(e) {
			return e instanceof code_1._Code && e._items.some((c) => c instanceof code_1.Name && names[c.str] === 1 && constants[c.str] !== void 0);
		}
	}
	function subtractNames(names, from) {
		for (const n in from) names[n] = (names[n] || 0) - (from[n] || 0);
	}
	function not(x) {
		return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._)`!${par(x)}`;
	}
	exports.not = not;
	var andCode = mappend(exports.operators.AND);
	function and(...args) {
		return args.reduce(andCode);
	}
	exports.and = and;
	var orCode = mappend(exports.operators.OR);
	function or(...args) {
		return args.reduce(orCode);
	}
	exports.or = or;
	function mappend(op) {
		return (x, y) => x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._)`${par(x)} ${op} ${par(y)}`;
	}
	function par(x) {
		return x instanceof code_1.Name ? x : (0, code_1._)`(${x})`;
	}
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/util.js
var require_util = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.checkStrictMode = exports.getErrorPath = exports.Type = exports.useFunc = exports.setEvaluated = exports.evaluatedPropsToName = exports.mergeEvaluated = exports.eachItem = exports.unescapeJsonPointer = exports.escapeJsonPointer = exports.escapeFragment = exports.unescapeFragment = exports.schemaRefOrVal = exports.schemaHasRulesButRef = exports.schemaHasRules = exports.checkUnknownRules = exports.alwaysValidSchema = exports.toHash = void 0;
	var codegen_1 = require_codegen();
	var code_1 = require_code$1();
	function toHash(arr) {
		const hash = {};
		for (const item of arr) hash[item] = true;
		return hash;
	}
	exports.toHash = toHash;
	function alwaysValidSchema(it, schema) {
		if (typeof schema == "boolean") return schema;
		if (Object.keys(schema).length === 0) return true;
		checkUnknownRules(it, schema);
		return !schemaHasRules(schema, it.self.RULES.all);
	}
	exports.alwaysValidSchema = alwaysValidSchema;
	function checkUnknownRules(it, schema = it.schema) {
		const { opts, self } = it;
		if (!opts.strictSchema) return;
		if (typeof schema === "boolean") return;
		const rules = self.RULES.keywords;
		for (const key in schema) if (!rules[key]) checkStrictMode(it, `unknown keyword: "${key}"`);
	}
	exports.checkUnknownRules = checkUnknownRules;
	function schemaHasRules(schema, rules) {
		if (typeof schema == "boolean") return !schema;
		for (const key in schema) if (rules[key]) return true;
		return false;
	}
	exports.schemaHasRules = schemaHasRules;
	function schemaHasRulesButRef(schema, RULES) {
		if (typeof schema == "boolean") return !schema;
		for (const key in schema) if (key !== "$ref" && RULES.all[key]) return true;
		return false;
	}
	exports.schemaHasRulesButRef = schemaHasRulesButRef;
	function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword, $data) {
		if (!$data) {
			if (typeof schema == "number" || typeof schema == "boolean") return schema;
			if (typeof schema == "string") return (0, codegen_1._)`${schema}`;
		}
		return (0, codegen_1._)`${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword)}`;
	}
	exports.schemaRefOrVal = schemaRefOrVal;
	function unescapeFragment(str) {
		return unescapeJsonPointer(decodeURIComponent(str));
	}
	exports.unescapeFragment = unescapeFragment;
	function escapeFragment(str) {
		return encodeURIComponent(escapeJsonPointer(str));
	}
	exports.escapeFragment = escapeFragment;
	function escapeJsonPointer(str) {
		if (typeof str == "number") return `${str}`;
		return str.replace(/~/g, "~0").replace(/\//g, "~1");
	}
	exports.escapeJsonPointer = escapeJsonPointer;
	function unescapeJsonPointer(str) {
		return str.replace(/~1/g, "/").replace(/~0/g, "~");
	}
	exports.unescapeJsonPointer = unescapeJsonPointer;
	function eachItem(xs, f) {
		if (Array.isArray(xs)) for (const x of xs) f(x);
		else f(xs);
	}
	exports.eachItem = eachItem;
	function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
		return (gen, from, to, toName) => {
			const res = to === void 0 ? from : to instanceof codegen_1.Name ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
			return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
		};
	}
	exports.mergeEvaluated = {
		props: makeMergeEvaluated({
			mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => {
				gen.if((0, codegen_1._)`${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._)`${to} || {}`).code((0, codegen_1._)`Object.assign(${to}, ${from})`));
			}),
			mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => {
				if (from === true) gen.assign(to, true);
				else {
					gen.assign(to, (0, codegen_1._)`${to} || {}`);
					setEvaluated(gen, to, from);
				}
			}),
			mergeValues: (from, to) => from === true ? true : {
				...from,
				...to
			},
			resultToName: evaluatedPropsToName
		}),
		items: makeMergeEvaluated({
			mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._)`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
			mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._)`${to} > ${from} ? ${to} : ${from}`)),
			mergeValues: (from, to) => from === true ? true : Math.max(from, to),
			resultToName: (gen, items) => gen.var("items", items)
		})
	};
	function evaluatedPropsToName(gen, ps) {
		if (ps === true) return gen.var("props", true);
		const props = gen.var("props", (0, codegen_1._)`{}`);
		if (ps !== void 0) setEvaluated(gen, props, ps);
		return props;
	}
	exports.evaluatedPropsToName = evaluatedPropsToName;
	function setEvaluated(gen, props, ps) {
		Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._)`${props}${(0, codegen_1.getProperty)(p)}`, true));
	}
	exports.setEvaluated = setEvaluated;
	var snippets = {};
	function useFunc(gen, f) {
		return gen.scopeValue("func", {
			ref: f,
			code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code))
		});
	}
	exports.useFunc = useFunc;
	var Type;
	(function(Type) {
		Type[Type["Num"] = 0] = "Num";
		Type[Type["Str"] = 1] = "Str";
	})(Type || (exports.Type = Type = {}));
	function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
		if (dataProp instanceof codegen_1.Name) {
			const isNumber = dataPropType === Type.Num;
			return jsPropertySyntax ? isNumber ? (0, codegen_1._)`"[" + ${dataProp} + "]"` : (0, codegen_1._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1._)`"/" + ${dataProp}` : (0, codegen_1._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
		}
		return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
	}
	exports.getErrorPath = getErrorPath;
	function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
		if (!mode) return;
		msg = `strict mode: ${msg}`;
		if (mode === true) throw new Error(msg);
		it.self.logger.warn(msg);
	}
	exports.checkStrictMode = checkStrictMode;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/names.js
var require_names = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var codegen_1 = require_codegen();
	exports.default = {
		data: new codegen_1.Name("data"),
		valCxt: new codegen_1.Name("valCxt"),
		instancePath: new codegen_1.Name("instancePath"),
		parentData: new codegen_1.Name("parentData"),
		parentDataProperty: new codegen_1.Name("parentDataProperty"),
		rootData: new codegen_1.Name("rootData"),
		dynamicAnchors: new codegen_1.Name("dynamicAnchors"),
		vErrors: new codegen_1.Name("vErrors"),
		errors: new codegen_1.Name("errors"),
		this: new codegen_1.Name("this"),
		self: new codegen_1.Name("self"),
		scope: new codegen_1.Name("scope"),
		json: new codegen_1.Name("json"),
		jsonPos: new codegen_1.Name("jsonPos"),
		jsonLen: new codegen_1.Name("jsonLen"),
		jsonPart: new codegen_1.Name("jsonPart")
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/errors.js
var require_errors = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.extendErrors = exports.resetErrorsCount = exports.reportExtraError = exports.reportError = exports.keyword$DataError = exports.keywordError = void 0;
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	var names_1 = require_names();
	exports.keywordError = { message: ({ keyword }) => (0, codegen_1.str)`must pass "${keyword}" keyword validation` };
	exports.keyword$DataError = { message: ({ keyword, schemaType }) => schemaType ? (0, codegen_1.str)`"${keyword}" keyword must be ${schemaType} ($data)` : (0, codegen_1.str)`"${keyword}" keyword is invalid ($data)` };
	function reportError(cxt, error = exports.keywordError, errorPaths, overrideAllErrors) {
		const { it } = cxt;
		const { gen, compositeRule, allErrors } = it;
		const errObj = errorObjectCode(cxt, error, errorPaths);
		if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : compositeRule || allErrors) addError(gen, errObj);
		else returnErrors(it, (0, codegen_1._)`[${errObj}]`);
	}
	exports.reportError = reportError;
	function reportExtraError(cxt, error = exports.keywordError, errorPaths) {
		const { it } = cxt;
		const { gen, compositeRule, allErrors } = it;
		addError(gen, errorObjectCode(cxt, error, errorPaths));
		if (!(compositeRule || allErrors)) returnErrors(it, names_1.default.vErrors);
	}
	exports.reportExtraError = reportExtraError;
	function resetErrorsCount(gen, errsCount) {
		gen.assign(names_1.default.errors, errsCount);
		gen.if((0, codegen_1._)`${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._)`${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
	}
	exports.resetErrorsCount = resetErrorsCount;
	function extendErrors({ gen, keyword, schemaValue, data, errsCount, it }) {
		/* istanbul ignore if */
		if (errsCount === void 0) throw new Error("ajv implementation error");
		const err = gen.name("err");
		gen.forRange("i", errsCount, names_1.default.errors, (i) => {
			gen.const(err, (0, codegen_1._)`${names_1.default.vErrors}[${i}]`);
			gen.if((0, codegen_1._)`${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._)`${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
			gen.assign((0, codegen_1._)`${err}.schemaPath`, (0, codegen_1.str)`${it.errSchemaPath}/${keyword}`);
			if (it.opts.verbose) {
				gen.assign((0, codegen_1._)`${err}.schema`, schemaValue);
				gen.assign((0, codegen_1._)`${err}.data`, data);
			}
		});
	}
	exports.extendErrors = extendErrors;
	function addError(gen, errObj) {
		const err = gen.const("err", errObj);
		gen.if((0, codegen_1._)`${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._)`[${err}]`), (0, codegen_1._)`${names_1.default.vErrors}.push(${err})`);
		gen.code((0, codegen_1._)`${names_1.default.errors}++`);
	}
	function returnErrors(it, errs) {
		const { gen, validateName, schemaEnv } = it;
		if (schemaEnv.$async) gen.throw((0, codegen_1._)`new ${it.ValidationError}(${errs})`);
		else {
			gen.assign((0, codegen_1._)`${validateName}.errors`, errs);
			gen.return(false);
		}
	}
	var E = {
		keyword: new codegen_1.Name("keyword"),
		schemaPath: new codegen_1.Name("schemaPath"),
		params: new codegen_1.Name("params"),
		propertyName: new codegen_1.Name("propertyName"),
		message: new codegen_1.Name("message"),
		schema: new codegen_1.Name("schema"),
		parentSchema: new codegen_1.Name("parentSchema")
	};
	function errorObjectCode(cxt, error, errorPaths) {
		const { createErrors } = cxt.it;
		if (createErrors === false) return (0, codegen_1._)`{}`;
		return errorObject(cxt, error, errorPaths);
	}
	function errorObject(cxt, error, errorPaths = {}) {
		const { gen, it } = cxt;
		const keyValues = [errorInstancePath(it, errorPaths), errorSchemaPath(cxt, errorPaths)];
		extraErrorProps(cxt, error, keyValues);
		return gen.object(...keyValues);
	}
	function errorInstancePath({ errorPath }, { instancePath }) {
		const instPath = instancePath ? (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}` : errorPath;
		return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
	}
	function errorSchemaPath({ keyword, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
		let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str)`${errSchemaPath}/${keyword}`;
		if (schemaPath) schPath = (0, codegen_1.str)`${schPath}${(0, util_1.getErrorPath)(schemaPath, util_1.Type.Str)}`;
		return [E.schemaPath, schPath];
	}
	function extraErrorProps(cxt, { params, message }, keyValues) {
		const { keyword, data, schemaValue, it } = cxt;
		const { opts, propertyName, topSchemaRef, schemaPath } = it;
		keyValues.push([E.keyword, keyword], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._)`{}`]);
		if (opts.messages) keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
		if (opts.verbose) keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._)`${topSchemaRef}${schemaPath}`], [names_1.default.data, data]);
		if (propertyName) keyValues.push([E.propertyName, propertyName]);
	}
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/boolSchema.js
var require_boolSchema = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.boolOrEmptySchema = exports.topBoolOrEmptySchema = void 0;
	var errors_1 = require_errors();
	var codegen_1 = require_codegen();
	var names_1 = require_names();
	var boolError = { message: "boolean schema is false" };
	function topBoolOrEmptySchema(it) {
		const { gen, schema, validateName } = it;
		if (schema === false) falseSchemaError(it, false);
		else if (typeof schema == "object" && schema.$async === true) gen.return(names_1.default.data);
		else {
			gen.assign((0, codegen_1._)`${validateName}.errors`, null);
			gen.return(true);
		}
	}
	exports.topBoolOrEmptySchema = topBoolOrEmptySchema;
	function boolOrEmptySchema(it, valid) {
		const { gen, schema } = it;
		if (schema === false) {
			gen.var(valid, false);
			falseSchemaError(it);
		} else gen.var(valid, true);
	}
	exports.boolOrEmptySchema = boolOrEmptySchema;
	function falseSchemaError(it, overrideAllErrors) {
		const { gen, data } = it;
		const cxt = {
			gen,
			keyword: "false schema",
			data,
			schema: false,
			schemaCode: false,
			schemaValue: false,
			params: {},
			it
		};
		(0, errors_1.reportError)(cxt, boolError, void 0, overrideAllErrors);
	}
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/rules.js
var require_rules = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.getRules = exports.isJSONType = void 0;
	var jsonTypes = /* @__PURE__ */ new Set([
		"string",
		"number",
		"integer",
		"boolean",
		"null",
		"object",
		"array"
	]);
	function isJSONType(x) {
		return typeof x == "string" && jsonTypes.has(x);
	}
	exports.isJSONType = isJSONType;
	function getRules() {
		const groups = {
			number: {
				type: "number",
				rules: []
			},
			string: {
				type: "string",
				rules: []
			},
			array: {
				type: "array",
				rules: []
			},
			object: {
				type: "object",
				rules: []
			}
		};
		return {
			types: {
				...groups,
				integer: true,
				boolean: true,
				null: true
			},
			rules: [
				{ rules: [] },
				groups.number,
				groups.string,
				groups.array,
				groups.object
			],
			post: { rules: [] },
			all: {},
			keywords: {}
		};
	}
	exports.getRules = getRules;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/applicability.js
var require_applicability = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.shouldUseRule = exports.shouldUseGroup = exports.schemaHasRulesForType = void 0;
	function schemaHasRulesForType({ schema, self }, type) {
		const group = self.RULES.types[type];
		return group && group !== true && shouldUseGroup(schema, group);
	}
	exports.schemaHasRulesForType = schemaHasRulesForType;
	function shouldUseGroup(schema, group) {
		return group.rules.some((rule) => shouldUseRule(schema, rule));
	}
	exports.shouldUseGroup = shouldUseGroup;
	function shouldUseRule(schema, rule) {
		var _a;
		return schema[rule.keyword] !== void 0 || ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema[kwd] !== void 0));
	}
	exports.shouldUseRule = shouldUseRule;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/dataType.js
var require_dataType = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.reportTypeError = exports.checkDataTypes = exports.checkDataType = exports.coerceAndCheckDataType = exports.getJSONTypes = exports.getSchemaTypes = exports.DataType = void 0;
	var rules_1 = require_rules();
	var applicability_1 = require_applicability();
	var errors_1 = require_errors();
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	var DataType;
	(function(DataType) {
		DataType[DataType["Correct"] = 0] = "Correct";
		DataType[DataType["Wrong"] = 1] = "Wrong";
	})(DataType || (exports.DataType = DataType = {}));
	function getSchemaTypes(schema) {
		const types = getJSONTypes(schema.type);
		if (types.includes("null")) {
			if (schema.nullable === false) throw new Error("type: null contradicts nullable: false");
		} else {
			if (!types.length && schema.nullable !== void 0) throw new Error("\"nullable\" cannot be used without \"type\"");
			if (schema.nullable === true) types.push("null");
		}
		return types;
	}
	exports.getSchemaTypes = getSchemaTypes;
	function getJSONTypes(ts) {
		const types = Array.isArray(ts) ? ts : ts ? [ts] : [];
		if (types.every(rules_1.isJSONType)) return types;
		throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
	}
	exports.getJSONTypes = getJSONTypes;
	function coerceAndCheckDataType(it, types) {
		const { gen, data, opts } = it;
		const coerceTo = coerceToTypes(types, opts.coerceTypes);
		const checkTypes = types.length > 0 && !(coerceTo.length === 0 && types.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types[0]));
		if (checkTypes) {
			const wrongType = checkDataTypes(types, data, opts.strictNumbers, DataType.Wrong);
			gen.if(wrongType, () => {
				if (coerceTo.length) coerceData(it, types, coerceTo);
				else reportTypeError(it);
			});
		}
		return checkTypes;
	}
	exports.coerceAndCheckDataType = coerceAndCheckDataType;
	var COERCIBLE = /* @__PURE__ */ new Set([
		"string",
		"number",
		"integer",
		"boolean",
		"null"
	]);
	function coerceToTypes(types, coerceTypes) {
		return coerceTypes ? types.filter((t) => COERCIBLE.has(t) || coerceTypes === "array" && t === "array") : [];
	}
	function coerceData(it, types, coerceTo) {
		const { gen, data, opts } = it;
		const dataType = gen.let("dataType", (0, codegen_1._)`typeof ${data}`);
		const coerced = gen.let("coerced", (0, codegen_1._)`undefined`);
		if (opts.coerceTypes === "array") gen.if((0, codegen_1._)`${dataType} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen.assign(data, (0, codegen_1._)`${data}[0]`).assign(dataType, (0, codegen_1._)`typeof ${data}`).if(checkDataTypes(types, data, opts.strictNumbers), () => gen.assign(coerced, data)));
		gen.if((0, codegen_1._)`${coerced} !== undefined`);
		for (const t of coerceTo) if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") coerceSpecificType(t);
		gen.else();
		reportTypeError(it);
		gen.endIf();
		gen.if((0, codegen_1._)`${coerced} !== undefined`, () => {
			gen.assign(data, coerced);
			assignParentData(it, coerced);
		});
		function coerceSpecificType(t) {
			switch (t) {
				case "string":
					gen.elseIf((0, codegen_1._)`${dataType} == "number" || ${dataType} == "boolean"`).assign(coerced, (0, codegen_1._)`"" + ${data}`).elseIf((0, codegen_1._)`${data} === null`).assign(coerced, (0, codegen_1._)`""`);
					return;
				case "number":
					gen.elseIf((0, codegen_1._)`${dataType} == "boolean" || ${data} === null
              || (${dataType} == "string" && ${data} && ${data} == +${data})`).assign(coerced, (0, codegen_1._)`+${data}`);
					return;
				case "integer":
					gen.elseIf((0, codegen_1._)`${dataType} === "boolean" || ${data} === null
              || (${dataType} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, (0, codegen_1._)`+${data}`);
					return;
				case "boolean":
					gen.elseIf((0, codegen_1._)`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf((0, codegen_1._)`${data} === "true" || ${data} === 1`).assign(coerced, true);
					return;
				case "null":
					gen.elseIf((0, codegen_1._)`${data} === "" || ${data} === 0 || ${data} === false`);
					gen.assign(coerced, null);
					return;
				case "array": gen.elseIf((0, codegen_1._)`${dataType} === "string" || ${dataType} === "number"
              || ${dataType} === "boolean" || ${data} === null`).assign(coerced, (0, codegen_1._)`[${data}]`);
			}
		}
	}
	function assignParentData({ gen, parentData, parentDataProperty }, expr) {
		gen.if((0, codegen_1._)`${parentData} !== undefined`, () => gen.assign((0, codegen_1._)`${parentData}[${parentDataProperty}]`, expr));
	}
	function checkDataType(dataType, data, strictNums, correct = DataType.Correct) {
		const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
		let cond;
		switch (dataType) {
			case "null": return (0, codegen_1._)`${data} ${EQ} null`;
			case "array":
				cond = (0, codegen_1._)`Array.isArray(${data})`;
				break;
			case "object":
				cond = (0, codegen_1._)`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
				break;
			case "integer":
				cond = numCond((0, codegen_1._)`!(${data} % 1) && !isNaN(${data})`);
				break;
			case "number":
				cond = numCond();
				break;
			default: return (0, codegen_1._)`typeof ${data} ${EQ} ${dataType}`;
		}
		return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
		function numCond(_cond = codegen_1.nil) {
			return (0, codegen_1.and)((0, codegen_1._)`typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._)`isFinite(${data})` : codegen_1.nil);
		}
	}
	exports.checkDataType = checkDataType;
	function checkDataTypes(dataTypes, data, strictNums, correct) {
		if (dataTypes.length === 1) return checkDataType(dataTypes[0], data, strictNums, correct);
		let cond;
		const types = (0, util_1.toHash)(dataTypes);
		if (types.array && types.object) {
			const notObj = (0, codegen_1._)`typeof ${data} != "object"`;
			cond = types.null ? notObj : (0, codegen_1._)`!${data} || ${notObj}`;
			delete types.null;
			delete types.array;
			delete types.object;
		} else cond = codegen_1.nil;
		if (types.number) delete types.integer;
		for (const t in types) cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
		return cond;
	}
	exports.checkDataTypes = checkDataTypes;
	var typeError = {
		message: ({ schema }) => `must be ${schema}`,
		params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._)`{type: ${schema}}` : (0, codegen_1._)`{type: ${schemaValue}}`
	};
	function reportTypeError(it) {
		const cxt = getTypeErrorContext(it);
		(0, errors_1.reportError)(cxt, typeError);
	}
	exports.reportTypeError = reportTypeError;
	function getTypeErrorContext(it) {
		const { gen, data, schema } = it;
		const schemaCode = (0, util_1.schemaRefOrVal)(it, schema, "type");
		return {
			gen,
			keyword: "type",
			data,
			schema: schema.type,
			schemaCode,
			schemaValue: schemaCode,
			parentSchema: schema,
			params: {},
			it
		};
	}
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/defaults.js
var require_defaults = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.assignDefaults = void 0;
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	function assignDefaults(it, ty) {
		const { properties, items } = it.schema;
		if (ty === "object" && properties) for (const key in properties) assignDefault(it, key, properties[key].default);
		else if (ty === "array" && Array.isArray(items)) items.forEach((sch, i) => assignDefault(it, i, sch.default));
	}
	exports.assignDefaults = assignDefaults;
	function assignDefault(it, prop, defaultValue) {
		const { gen, compositeRule, data, opts } = it;
		if (defaultValue === void 0) return;
		const childData = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(prop)}`;
		if (compositeRule) {
			(0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
			return;
		}
		let condition = (0, codegen_1._)`${childData} === undefined`;
		if (opts.useDefaults === "empty") condition = (0, codegen_1._)`${condition} || ${childData} === null || ${childData} === ""`;
		gen.if(condition, (0, codegen_1._)`${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
	}
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/code.js
var require_code = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.validateUnion = exports.validateArray = exports.usePattern = exports.callValidateCode = exports.schemaProperties = exports.allSchemaProperties = exports.noPropertyInData = exports.propertyInData = exports.isOwnProperty = exports.hasPropFunc = exports.reportMissingProp = exports.checkMissingProp = exports.checkReportMissingProp = void 0;
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	var names_1 = require_names();
	var util_2 = require_util();
	function checkReportMissingProp(cxt, prop) {
		const { gen, data, it } = cxt;
		gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
			cxt.setParams({ missingProperty: (0, codegen_1._)`${prop}` }, true);
			cxt.error();
		});
	}
	exports.checkReportMissingProp = checkReportMissingProp;
	function checkMissingProp({ gen, data, it: { opts } }, properties, missing) {
		return (0, codegen_1.or)(...properties.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing} = ${prop}`)));
	}
	exports.checkMissingProp = checkMissingProp;
	function reportMissingProp(cxt, missing) {
		cxt.setParams({ missingProperty: missing }, true);
		cxt.error();
	}
	exports.reportMissingProp = reportMissingProp;
	function hasPropFunc(gen) {
		return gen.scopeValue("func", {
			ref: Object.prototype.hasOwnProperty,
			code: (0, codegen_1._)`Object.prototype.hasOwnProperty`
		});
	}
	exports.hasPropFunc = hasPropFunc;
	function isOwnProperty(gen, data, property) {
		return (0, codegen_1._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
	}
	exports.isOwnProperty = isOwnProperty;
	function propertyInData(gen, data, property, ownProperties) {
		const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
		return ownProperties ? (0, codegen_1._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
	}
	exports.propertyInData = propertyInData;
	function noPropertyInData(gen, data, property, ownProperties) {
		const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} === undefined`;
		return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
	}
	exports.noPropertyInData = noPropertyInData;
	function allSchemaProperties(schemaMap) {
		return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
	}
	exports.allSchemaProperties = allSchemaProperties;
	function schemaProperties(it, schemaMap) {
		return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
	}
	exports.schemaProperties = schemaProperties;
	function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
		const dataAndSchema = passSchema ? (0, codegen_1._)`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
		const valCxt = [
			[names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
			[names_1.default.parentData, it.parentData],
			[names_1.default.parentDataProperty, it.parentDataProperty],
			[names_1.default.rootData, names_1.default.rootData]
		];
		if (it.opts.dynamicRef) valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
		const args = (0, codegen_1._)`${dataAndSchema}, ${gen.object(...valCxt)}`;
		return context !== codegen_1.nil ? (0, codegen_1._)`${func}.call(${context}, ${args})` : (0, codegen_1._)`${func}(${args})`;
	}
	exports.callValidateCode = callValidateCode;
	var newRegExp = (0, codegen_1._)`new RegExp`;
	function usePattern({ gen, it: { opts } }, pattern) {
		const u = opts.unicodeRegExp ? "u" : "";
		const { regExp } = opts.code;
		const rx = regExp(pattern, u);
		return gen.scopeValue("pattern", {
			key: rx.toString(),
			ref: rx,
			code: (0, codegen_1._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern}, ${u})`
		});
	}
	exports.usePattern = usePattern;
	function validateArray(cxt) {
		const { gen, data, keyword, it } = cxt;
		const valid = gen.name("valid");
		if (it.allErrors) {
			const validArr = gen.let("valid", true);
			validateItems(() => gen.assign(validArr, false));
			return validArr;
		}
		gen.var(valid, true);
		validateItems(() => gen.break());
		return valid;
		function validateItems(notValid) {
			const len = gen.const("len", (0, codegen_1._)`${data}.length`);
			gen.forRange("i", 0, len, (i) => {
				cxt.subschema({
					keyword,
					dataProp: i,
					dataPropType: util_1.Type.Num
				}, valid);
				gen.if((0, codegen_1.not)(valid), notValid);
			});
		}
	}
	exports.validateArray = validateArray;
	function validateUnion(cxt) {
		const { gen, schema, keyword, it } = cxt;
		/* istanbul ignore if */
		if (!Array.isArray(schema)) throw new Error("ajv implementation error");
		if (schema.some((sch) => (0, util_1.alwaysValidSchema)(it, sch)) && !it.opts.unevaluated) return;
		const valid = gen.let("valid", false);
		const schValid = gen.name("_valid");
		gen.block(() => schema.forEach((_sch, i) => {
			const schCxt = cxt.subschema({
				keyword,
				schemaProp: i,
				compositeRule: true
			}, schValid);
			gen.assign(valid, (0, codegen_1._)`${valid} || ${schValid}`);
			if (!cxt.mergeValidEvaluated(schCxt, schValid)) gen.if((0, codegen_1.not)(valid));
		}));
		cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
	}
	exports.validateUnion = validateUnion;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/keyword.js
var require_keyword = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.validateKeywordUsage = exports.validSchemaType = exports.funcKeywordCode = exports.macroKeywordCode = void 0;
	var codegen_1 = require_codegen();
	var names_1 = require_names();
	var code_1 = require_code();
	var errors_1 = require_errors();
	function macroKeywordCode(cxt, def) {
		const { gen, keyword, schema, parentSchema, it } = cxt;
		const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
		const schemaRef = useKeyword(gen, keyword, macroSchema);
		if (it.opts.validateSchema !== false) it.self.validateSchema(macroSchema, true);
		const valid = gen.name("valid");
		cxt.subschema({
			schema: macroSchema,
			schemaPath: codegen_1.nil,
			errSchemaPath: `${it.errSchemaPath}/${keyword}`,
			topSchemaRef: schemaRef,
			compositeRule: true
		}, valid);
		cxt.pass(valid, () => cxt.error(true));
	}
	exports.macroKeywordCode = macroKeywordCode;
	function funcKeywordCode(cxt, def) {
		var _a;
		const { gen, keyword, schema, parentSchema, $data, it } = cxt;
		checkAsyncKeyword(it, def);
		const validateRef = useKeyword(gen, keyword, !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate);
		const valid = gen.let("valid");
		cxt.block$data(valid, validateKeyword);
		cxt.ok((_a = def.valid) !== null && _a !== void 0 ? _a : valid);
		function validateKeyword() {
			if (def.errors === false) {
				assignValid();
				if (def.modifying) modifyData(cxt);
				reportErrs(() => cxt.error());
			} else {
				const ruleErrs = def.async ? validateAsync() : validateSync();
				if (def.modifying) modifyData(cxt);
				reportErrs(() => addErrs(cxt, ruleErrs));
			}
		}
		function validateAsync() {
			const ruleErrs = gen.let("ruleErrs", null);
			gen.try(() => assignValid((0, codegen_1._)`await `), (e) => gen.assign(valid, false).if((0, codegen_1._)`${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._)`${e}.errors`), () => gen.throw(e)));
			return ruleErrs;
		}
		function validateSync() {
			const validateErrs = (0, codegen_1._)`${validateRef}.errors`;
			gen.assign(validateErrs, null);
			assignValid(codegen_1.nil);
			return validateErrs;
		}
		function assignValid(_await = def.async ? (0, codegen_1._)`await ` : codegen_1.nil) {
			const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
			const passSchema = !("compile" in def && !$data || def.schema === false);
			gen.assign(valid, (0, codegen_1._)`${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
		}
		function reportErrs(errors) {
			var _a;
			gen.if((0, codegen_1.not)((_a = def.valid) !== null && _a !== void 0 ? _a : valid), errors);
		}
	}
	exports.funcKeywordCode = funcKeywordCode;
	function modifyData(cxt) {
		const { gen, data, it } = cxt;
		gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._)`${it.parentData}[${it.parentDataProperty}]`));
	}
	function addErrs(cxt, errs) {
		const { gen } = cxt;
		gen.if((0, codegen_1._)`Array.isArray(${errs})`, () => {
			gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`).assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
			(0, errors_1.extendErrors)(cxt);
		}, () => cxt.error());
	}
	function checkAsyncKeyword({ schemaEnv }, def) {
		if (def.async && !schemaEnv.$async) throw new Error("async keyword in sync schema");
	}
	function useKeyword(gen, keyword, result) {
		if (result === void 0) throw new Error(`keyword "${keyword}" failed to compile`);
		return gen.scopeValue("keyword", typeof result == "function" ? { ref: result } : {
			ref: result,
			code: (0, codegen_1.stringify)(result)
		});
	}
	function validSchemaType(schema, schemaType, allowUndefined = false) {
		return !schemaType.length || schemaType.some((st) => st === "array" ? Array.isArray(schema) : st === "object" ? schema && typeof schema == "object" && !Array.isArray(schema) : typeof schema == st || allowUndefined && typeof schema == "undefined");
	}
	exports.validSchemaType = validSchemaType;
	function validateKeywordUsage({ schema, opts, self, errSchemaPath }, def, keyword) {
		/* istanbul ignore if */
		if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword) : def.keyword !== keyword) throw new Error("ajv implementation error");
		const deps = def.dependencies;
		if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) throw new Error(`parent schema must have dependencies of ${keyword}: ${deps.join(",")}`);
		if (def.validateSchema) {
			if (!def.validateSchema(schema[keyword])) {
				const msg = `keyword "${keyword}" value is invalid at path "${errSchemaPath}": ` + self.errorsText(def.validateSchema.errors);
				if (opts.validateSchema === "log") self.logger.error(msg);
				else throw new Error(msg);
			}
		}
	}
	exports.validateKeywordUsage = validateKeywordUsage;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/subschema.js
var require_subschema = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.extendSubschemaMode = exports.extendSubschemaData = exports.getSubschema = void 0;
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	function getSubschema(it, { keyword, schemaProp, schema, schemaPath, errSchemaPath, topSchemaRef }) {
		if (keyword !== void 0 && schema !== void 0) throw new Error("both \"keyword\" and \"schema\" passed, only one allowed");
		if (keyword !== void 0) {
			const sch = it.schema[keyword];
			return schemaProp === void 0 ? {
				schema: sch,
				schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}`,
				errSchemaPath: `${it.errSchemaPath}/${keyword}`
			} : {
				schema: sch[schemaProp],
				schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}${(0, codegen_1.getProperty)(schemaProp)}`,
				errSchemaPath: `${it.errSchemaPath}/${keyword}/${(0, util_1.escapeFragment)(schemaProp)}`
			};
		}
		if (schema !== void 0) {
			if (schemaPath === void 0 || errSchemaPath === void 0 || topSchemaRef === void 0) throw new Error("\"schemaPath\", \"errSchemaPath\" and \"topSchemaRef\" are required with \"schema\"");
			return {
				schema,
				schemaPath,
				topSchemaRef,
				errSchemaPath
			};
		}
		throw new Error("either \"keyword\" or \"schema\" must be passed");
	}
	exports.getSubschema = getSubschema;
	function extendSubschemaData(subschema, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
		if (data !== void 0 && dataProp !== void 0) throw new Error("both \"data\" and \"dataProp\" passed, only one allowed");
		const { gen } = it;
		if (dataProp !== void 0) {
			const { errorPath, dataPathArr, opts } = it;
			dataContextProps(gen.let("data", (0, codegen_1._)`${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true));
			subschema.errorPath = (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
			subschema.parentDataProperty = (0, codegen_1._)`${dataProp}`;
			subschema.dataPathArr = [...dataPathArr, subschema.parentDataProperty];
		}
		if (data !== void 0) {
			dataContextProps(data instanceof codegen_1.Name ? data : gen.let("data", data, true));
			if (propertyName !== void 0) subschema.propertyName = propertyName;
		}
		if (dataTypes) subschema.dataTypes = dataTypes;
		function dataContextProps(_nextData) {
			subschema.data = _nextData;
			subschema.dataLevel = it.dataLevel + 1;
			subschema.dataTypes = [];
			it.definedProperties = /* @__PURE__ */ new Set();
			subschema.parentData = it.data;
			subschema.dataNames = [...it.dataNames, _nextData];
		}
	}
	exports.extendSubschemaData = extendSubschemaData;
	function extendSubschemaMode(subschema, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
		if (compositeRule !== void 0) subschema.compositeRule = compositeRule;
		if (createErrors !== void 0) subschema.createErrors = createErrors;
		if (allErrors !== void 0) subschema.allErrors = allErrors;
		subschema.jtdDiscriminator = jtdDiscriminator;
		subschema.jtdMetadata = jtdMetadata;
	}
	exports.extendSubschemaMode = extendSubschemaMode;
}));
// node_modules/.pnpm/fast-deep-equal@3.1.3/node_modules/fast-deep-equal/index.js
var require_fast_deep_equal = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = function equal(a, b) {
		if (a === b) return true;
		if (a && b && typeof a == "object" && typeof b == "object") {
			if (a.constructor !== b.constructor) return false;
			var length, i, keys;
			if (Array.isArray(a)) {
				length = a.length;
				if (length != b.length) return false;
				for (i = length; i-- !== 0;) if (!equal(a[i], b[i])) return false;
				return true;
			}
			if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
			if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
			if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
			keys = Object.keys(a);
			length = keys.length;
			if (length !== Object.keys(b).length) return false;
			for (i = length; i-- !== 0;) if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
			for (i = length; i-- !== 0;) {
				var key = keys[i];
				if (!equal(a[key], b[key])) return false;
			}
			return true;
		}
		return a !== a && b !== b;
	};
}));
// node_modules/.pnpm/json-schema-traverse@1.0.0/node_modules/json-schema-traverse/index.js
var require_json_schema_traverse = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var traverse = module.exports = function(schema, opts, cb) {
		if (typeof opts == "function") {
			cb = opts;
			opts = {};
		}
		cb = opts.cb || cb;
		var pre = typeof cb == "function" ? cb : cb.pre || function() {};
		var post = cb.post || function() {};
		_traverse(opts, pre, post, schema, "", schema);
	};
	traverse.keywords = {
		additionalItems: true,
		items: true,
		contains: true,
		additionalProperties: true,
		propertyNames: true,
		not: true,
		if: true,
		then: true,
		else: true
	};
	traverse.arrayKeywords = {
		items: true,
		allOf: true,
		anyOf: true,
		oneOf: true
	};
	traverse.propsKeywords = {
		$defs: true,
		definitions: true,
		properties: true,
		patternProperties: true,
		dependencies: true
	};
	traverse.skipKeywords = {
		default: true,
		enum: true,
		const: true,
		required: true,
		maximum: true,
		minimum: true,
		exclusiveMaximum: true,
		exclusiveMinimum: true,
		multipleOf: true,
		maxLength: true,
		minLength: true,
		pattern: true,
		format: true,
		maxItems: true,
		minItems: true,
		uniqueItems: true,
		maxProperties: true,
		minProperties: true
	};
	function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
		if (schema && typeof schema == "object" && !Array.isArray(schema)) {
			pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
			for (var key in schema) {
				var sch = schema[key];
				if (Array.isArray(sch)) {
					if (key in traverse.arrayKeywords) for (var i = 0; i < sch.length; i++) _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
				} else if (key in traverse.propsKeywords) {
					if (sch && typeof sch == "object") for (var prop in sch) _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
				} else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
			}
			post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
		}
	}
	function escapeJsonPtr(str) {
		return str.replace(/~/g, "~0").replace(/\//g, "~1");
	}
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/resolve.js
var require_resolve = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.getSchemaRefs = exports.resolveUrl = exports.normalizeId = exports._getFullPath = exports.getFullPath = exports.inlineRef = void 0;
	var util_1 = require_util();
	var equal = require_fast_deep_equal();
	var traverse = require_json_schema_traverse();
	var SIMPLE_INLINED = /* @__PURE__ */ new Set([
		"type",
		"format",
		"pattern",
		"maxLength",
		"minLength",
		"maxProperties",
		"minProperties",
		"maxItems",
		"minItems",
		"maximum",
		"minimum",
		"uniqueItems",
		"multipleOf",
		"required",
		"enum",
		"const"
	]);
	function inlineRef(schema, limit = true) {
		if (typeof schema == "boolean") return true;
		if (limit === true) return !hasRef(schema);
		if (!limit) return false;
		return countKeys(schema) <= limit;
	}
	exports.inlineRef = inlineRef;
	var REF_KEYWORDS = /* @__PURE__ */ new Set([
		"$ref",
		"$recursiveRef",
		"$recursiveAnchor",
		"$dynamicRef",
		"$dynamicAnchor"
	]);
	function hasRef(schema) {
		for (const key in schema) {
			if (REF_KEYWORDS.has(key)) return true;
			const sch = schema[key];
			if (Array.isArray(sch) && sch.some(hasRef)) return true;
			if (typeof sch == "object" && hasRef(sch)) return true;
		}
		return false;
	}
	function countKeys(schema) {
		let count = 0;
		for (const key in schema) {
			if (key === "$ref") return Infinity;
			count++;
			if (SIMPLE_INLINED.has(key)) continue;
			if (typeof schema[key] == "object") (0, util_1.eachItem)(schema[key], (sch) => count += countKeys(sch));
			if (count === Infinity) return Infinity;
		}
		return count;
	}
	function getFullPath(resolver, id = "", normalize) {
		if (normalize !== false) id = normalizeId(id);
		return _getFullPath(resolver, resolver.parse(id));
	}
	exports.getFullPath = getFullPath;
	function _getFullPath(resolver, p) {
		return resolver.serialize(p).split("#")[0] + "#";
	}
	exports._getFullPath = _getFullPath;
	var TRAILING_SLASH_HASH = /#\/?$/;
	function normalizeId(id) {
		return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
	}
	exports.normalizeId = normalizeId;
	function resolveUrl(resolver, baseId, id) {
		id = normalizeId(id);
		return resolver.resolve(baseId, id);
	}
	exports.resolveUrl = resolveUrl;
	var ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
	function getSchemaRefs(schema, baseId) {
		if (typeof schema == "boolean") return {};
		const { schemaId, uriResolver } = this.opts;
		const schId = normalizeId(schema[schemaId] || baseId);
		const baseIds = { "": schId };
		const pathPrefix = getFullPath(uriResolver, schId, false);
		const localRefs = {};
		const schemaRefs = /* @__PURE__ */ new Set();
		traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
			if (parentJsonPtr === void 0) return;
			const fullPath = pathPrefix + jsonPtr;
			let innerBaseId = baseIds[parentJsonPtr];
			if (typeof sch[schemaId] == "string") innerBaseId = addRef.call(this, sch[schemaId]);
			addAnchor.call(this, sch.$anchor);
			addAnchor.call(this, sch.$dynamicAnchor);
			baseIds[jsonPtr] = innerBaseId;
			function addRef(ref) {
				const _resolve = this.opts.uriResolver.resolve;
				ref = normalizeId(innerBaseId ? _resolve(innerBaseId, ref) : ref);
				if (schemaRefs.has(ref)) throw ambiguos(ref);
				schemaRefs.add(ref);
				let schOrRef = this.refs[ref];
				if (typeof schOrRef == "string") schOrRef = this.refs[schOrRef];
				if (typeof schOrRef == "object") checkAmbiguosRef(sch, schOrRef.schema, ref);
				else if (ref !== normalizeId(fullPath)) {
					if (ref[0] === "#") {
						checkAmbiguosRef(sch, localRefs[ref], ref);
						localRefs[ref] = sch;
					} else this.refs[ref] = fullPath;
				}
				return ref;
			}
			function addAnchor(anchor) {
				if (typeof anchor == "string") {
					if (!ANCHOR.test(anchor)) throw new Error(`invalid anchor "${anchor}"`);
					addRef.call(this, `#${anchor}`);
				}
			}
		});
		return localRefs;
		function checkAmbiguosRef(sch1, sch2, ref) {
			if (sch2 !== void 0 && !equal(sch1, sch2)) throw ambiguos(ref);
		}
		function ambiguos(ref) {
			return /* @__PURE__ */ new Error(`reference "${ref}" resolves to more than one schema`);
		}
	}
	exports.getSchemaRefs = getSchemaRefs;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/index.js
var require_validate = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.getData = exports.KeywordCxt = exports.validateFunctionCode = void 0;
	var boolSchema_1 = require_boolSchema();
	var dataType_1 = require_dataType();
	var applicability_1 = require_applicability();
	var dataType_2 = require_dataType();
	var defaults_1 = require_defaults();
	var keyword_1 = require_keyword();
	var subschema_1 = require_subschema();
	var codegen_1 = require_codegen();
	var names_1 = require_names();
	var resolve_1 = require_resolve();
	var util_1 = require_util();
	var errors_1 = require_errors();
	function validateFunctionCode(it) {
		if (isSchemaObj(it)) {
			checkKeywords(it);
			if (schemaCxtHasRules(it)) {
				topSchemaObjCode(it);
				return;
			}
		}
		validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
	}
	exports.validateFunctionCode = validateFunctionCode;
	function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
		if (opts.code.es5) gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
			gen.code((0, codegen_1._)`"use strict"; ${funcSourceUrl(schema, opts)}`);
			destructureValCxtES5(gen, opts);
			gen.code(body);
		});
		else gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
	}
	function destructureValCxt(opts) {
		return (0, codegen_1._)`{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._)`, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
	}
	function destructureValCxtES5(gen, opts) {
		gen.if(names_1.default.valCxt, () => {
			gen.var(names_1.default.instancePath, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.instancePath}`);
			gen.var(names_1.default.parentData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentData}`);
			gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
			gen.var(names_1.default.rootData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.rootData}`);
			if (opts.dynamicRef) gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
		}, () => {
			gen.var(names_1.default.instancePath, (0, codegen_1._)`""`);
			gen.var(names_1.default.parentData, (0, codegen_1._)`undefined`);
			gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`undefined`);
			gen.var(names_1.default.rootData, names_1.default.data);
			if (opts.dynamicRef) gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`{}`);
		});
	}
	function topSchemaObjCode(it) {
		const { schema, opts, gen } = it;
		validateFunction(it, () => {
			if (opts.$comment && schema.$comment) commentKeyword(it);
			checkNoDefault(it);
			gen.let(names_1.default.vErrors, null);
			gen.let(names_1.default.errors, 0);
			if (opts.unevaluated) resetEvaluated(it);
			typeAndKeywords(it);
			returnResults(it);
		});
	}
	function resetEvaluated(it) {
		const { gen, validateName } = it;
		it.evaluated = gen.const("evaluated", (0, codegen_1._)`${validateName}.evaluated`);
		gen.if((0, codegen_1._)`${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._)`${it.evaluated}.props`, (0, codegen_1._)`undefined`));
		gen.if((0, codegen_1._)`${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._)`${it.evaluated}.items`, (0, codegen_1._)`undefined`));
	}
	function funcSourceUrl(schema, opts) {
		const schId = typeof schema == "object" && schema[opts.schemaId];
		return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._)`/*# sourceURL=${schId} */` : codegen_1.nil;
	}
	function subschemaCode(it, valid) {
		if (isSchemaObj(it)) {
			checkKeywords(it);
			if (schemaCxtHasRules(it)) {
				subSchemaObjCode(it, valid);
				return;
			}
		}
		(0, boolSchema_1.boolOrEmptySchema)(it, valid);
	}
	function schemaCxtHasRules({ schema, self }) {
		if (typeof schema == "boolean") return !schema;
		for (const key in schema) if (self.RULES.all[key]) return true;
		return false;
	}
	function isSchemaObj(it) {
		return typeof it.schema != "boolean";
	}
	function subSchemaObjCode(it, valid) {
		const { schema, gen, opts } = it;
		if (opts.$comment && schema.$comment) commentKeyword(it);
		updateContext(it);
		checkAsyncSchema(it);
		const errsCount = gen.const("_errs", names_1.default.errors);
		typeAndKeywords(it, errsCount);
		gen.var(valid, (0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
	}
	function checkKeywords(it) {
		(0, util_1.checkUnknownRules)(it);
		checkRefsAndKeywords(it);
	}
	function typeAndKeywords(it, errsCount) {
		if (it.opts.jtd) return schemaKeywords(it, [], false, errsCount);
		const types = (0, dataType_1.getSchemaTypes)(it.schema);
		schemaKeywords(it, types, !(0, dataType_1.coerceAndCheckDataType)(it, types), errsCount);
	}
	function checkRefsAndKeywords(it) {
		const { schema, errSchemaPath, opts, self } = it;
		if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self.RULES)) self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
	}
	function checkNoDefault(it) {
		const { schema, opts } = it;
		if (schema.default !== void 0 && opts.useDefaults && opts.strictSchema) (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
	}
	function updateContext(it) {
		const schId = it.schema[it.opts.schemaId];
		if (schId) it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
	}
	function checkAsyncSchema(it) {
		if (it.schema.$async && !it.schemaEnv.$async) throw new Error("async schema in sync schema");
	}
	function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
		const msg = schema.$comment;
		if (opts.$comment === true) gen.code((0, codegen_1._)`${names_1.default.self}.logger.log(${msg})`);
		else if (typeof opts.$comment == "function") {
			const schemaPath = (0, codegen_1.str)`${errSchemaPath}/$comment`;
			const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
			gen.code((0, codegen_1._)`${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
		}
	}
	function returnResults(it) {
		const { gen, schemaEnv, validateName, ValidationError, opts } = it;
		if (schemaEnv.$async) gen.if((0, codegen_1._)`${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._)`new ${ValidationError}(${names_1.default.vErrors})`));
		else {
			gen.assign((0, codegen_1._)`${validateName}.errors`, names_1.default.vErrors);
			if (opts.unevaluated) assignEvaluated(it);
			gen.return((0, codegen_1._)`${names_1.default.errors} === 0`);
		}
	}
	function assignEvaluated({ gen, evaluated, props, items }) {
		if (props instanceof codegen_1.Name) gen.assign((0, codegen_1._)`${evaluated}.props`, props);
		if (items instanceof codegen_1.Name) gen.assign((0, codegen_1._)`${evaluated}.items`, items);
	}
	function schemaKeywords(it, types, typeErrors, errsCount) {
		const { gen, schema, data, allErrors, opts, self } = it;
		const { RULES } = self;
		if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema, RULES))) {
			gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition));
			return;
		}
		if (!opts.jtd) checkStrictTypes(it, types);
		gen.block(() => {
			for (const group of RULES.rules) groupKeywords(group);
			groupKeywords(RULES.post);
		});
		function groupKeywords(group) {
			if (!(0, applicability_1.shouldUseGroup)(schema, group)) return;
			if (group.type) {
				gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
				iterateKeywords(it, group);
				if (types.length === 1 && types[0] === group.type && typeErrors) {
					gen.else();
					(0, dataType_2.reportTypeError)(it);
				}
				gen.endIf();
			} else iterateKeywords(it, group);
			if (!allErrors) gen.if((0, codegen_1._)`${names_1.default.errors} === ${errsCount || 0}`);
		}
	}
	function iterateKeywords(it, group) {
		const { gen, schema, opts: { useDefaults } } = it;
		if (useDefaults) (0, defaults_1.assignDefaults)(it, group.type);
		gen.block(() => {
			for (const rule of group.rules) if ((0, applicability_1.shouldUseRule)(schema, rule)) keywordCode(it, rule.keyword, rule.definition, group.type);
		});
	}
	function checkStrictTypes(it, types) {
		if (it.schemaEnv.meta || !it.opts.strictTypes) return;
		checkContextTypes(it, types);
		if (!it.opts.allowUnionTypes) checkMultipleTypes(it, types);
		checkKeywordTypes(it, it.dataTypes);
	}
	function checkContextTypes(it, types) {
		if (!types.length) return;
		if (!it.dataTypes.length) {
			it.dataTypes = types;
			return;
		}
		types.forEach((t) => {
			if (!includesType(it.dataTypes, t)) strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
		});
		narrowSchemaTypes(it, types);
	}
	function checkMultipleTypes(it, ts) {
		if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) strictTypesError(it, "use allowUnionTypes to allow union type keyword");
	}
	function checkKeywordTypes(it, ts) {
		const rules = it.self.RULES.all;
		for (const keyword in rules) {
			const rule = rules[keyword];
			if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
				const { type } = rule.definition;
				if (type.length && !type.some((t) => hasApplicableType(ts, t))) strictTypesError(it, `missing type "${type.join(",")}" for keyword "${keyword}"`);
			}
		}
	}
	function hasApplicableType(schTs, kwdT) {
		return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
	}
	function includesType(ts, t) {
		return ts.includes(t) || t === "integer" && ts.includes("number");
	}
	function narrowSchemaTypes(it, withTypes) {
		const ts = [];
		for (const t of it.dataTypes) if (includesType(withTypes, t)) ts.push(t);
		else if (withTypes.includes("integer") && t === "number") ts.push("integer");
		it.dataTypes = ts;
	}
	function strictTypesError(it, msg) {
		const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
		msg += ` at "${schemaPath}" (strictTypes)`;
		(0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
	}
	var KeywordCxt = class {
		constructor(it, def, keyword) {
			(0, keyword_1.validateKeywordUsage)(it, def, keyword);
			this.gen = it.gen;
			this.allErrors = it.allErrors;
			this.keyword = keyword;
			this.data = it.data;
			this.schema = it.schema[keyword];
			this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
			this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword, this.$data);
			this.schemaType = def.schemaType;
			this.parentSchema = it.schema;
			this.params = {};
			this.it = it;
			this.def = def;
			if (this.$data) this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
			else {
				this.schemaCode = this.schemaValue;
				if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) throw new Error(`${keyword} value must be ${JSON.stringify(def.schemaType)}`);
			}
			if ("code" in def ? def.trackErrors : def.errors !== false) this.errsCount = it.gen.const("_errs", names_1.default.errors);
		}
		result(condition, successAction, failAction) {
			this.failResult((0, codegen_1.not)(condition), successAction, failAction);
		}
		failResult(condition, successAction, failAction) {
			this.gen.if(condition);
			if (failAction) failAction();
			else this.error();
			if (successAction) {
				this.gen.else();
				successAction();
				if (this.allErrors) this.gen.endIf();
			} else if (this.allErrors) this.gen.endIf();
			else this.gen.else();
		}
		pass(condition, failAction) {
			this.failResult((0, codegen_1.not)(condition), void 0, failAction);
		}
		fail(condition) {
			if (condition === void 0) {
				this.error();
				if (!this.allErrors) this.gen.if(false);
				return;
			}
			this.gen.if(condition);
			this.error();
			if (this.allErrors) this.gen.endIf();
			else this.gen.else();
		}
		fail$data(condition) {
			if (!this.$data) return this.fail(condition);
			const { schemaCode } = this;
			this.fail((0, codegen_1._)`${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
		}
		error(append, errorParams, errorPaths) {
			if (errorParams) {
				this.setParams(errorParams);
				this._error(append, errorPaths);
				this.setParams({});
				return;
			}
			this._error(append, errorPaths);
		}
		_error(append, errorPaths) {
			(append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
		}
		$dataError() {
			(0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
		}
		reset() {
			if (this.errsCount === void 0) throw new Error("add \"trackErrors\" to keyword definition");
			(0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
		}
		ok(cond) {
			if (!this.allErrors) this.gen.if(cond);
		}
		setParams(obj, assign) {
			if (assign) Object.assign(this.params, obj);
			else this.params = obj;
		}
		block$data(valid, codeBlock, $dataValid = codegen_1.nil) {
			this.gen.block(() => {
				this.check$data(valid, $dataValid);
				codeBlock();
			});
		}
		check$data(valid = codegen_1.nil, $dataValid = codegen_1.nil) {
			if (!this.$data) return;
			const { gen, schemaCode, schemaType, def } = this;
			gen.if((0, codegen_1.or)((0, codegen_1._)`${schemaCode} === undefined`, $dataValid));
			if (valid !== codegen_1.nil) gen.assign(valid, true);
			if (schemaType.length || def.validateSchema) {
				gen.elseIf(this.invalid$data());
				this.$dataError();
				if (valid !== codegen_1.nil) gen.assign(valid, false);
			}
			gen.else();
		}
		invalid$data() {
			const { gen, schemaCode, schemaType, def, it } = this;
			return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
			function wrong$DataType() {
				if (schemaType.length) {
					/* istanbul ignore if */
					if (!(schemaCode instanceof codegen_1.Name)) throw new Error("ajv implementation error");
					const st = Array.isArray(schemaType) ? schemaType : [schemaType];
					return (0, codegen_1._)`${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
				}
				return codegen_1.nil;
			}
			function invalid$DataSchema() {
				if (def.validateSchema) {
					const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema });
					return (0, codegen_1._)`!${validateSchemaRef}(${schemaCode})`;
				}
				return codegen_1.nil;
			}
		}
		subschema(appl, valid) {
			const subschema = (0, subschema_1.getSubschema)(this.it, appl);
			(0, subschema_1.extendSubschemaData)(subschema, this.it, appl);
			(0, subschema_1.extendSubschemaMode)(subschema, appl);
			const nextContext = {
				...this.it,
				...subschema,
				items: void 0,
				props: void 0
			};
			subschemaCode(nextContext, valid);
			return nextContext;
		}
		mergeEvaluated(schemaCxt, toName) {
			const { it, gen } = this;
			if (!it.opts.unevaluated) return;
			if (it.props !== true && schemaCxt.props !== void 0) it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
			if (it.items !== true && schemaCxt.items !== void 0) it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
		}
		mergeValidEvaluated(schemaCxt, valid) {
			const { it, gen } = this;
			if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
				gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
				return true;
			}
		}
	};
	exports.KeywordCxt = KeywordCxt;
	function keywordCode(it, keyword, def, ruleType) {
		const cxt = new KeywordCxt(it, def, keyword);
		if ("code" in def) def.code(cxt, ruleType);
		else if (cxt.$data && def.validate) (0, keyword_1.funcKeywordCode)(cxt, def);
		else if ("macro" in def) (0, keyword_1.macroKeywordCode)(cxt, def);
		else if (def.compile || def.validate) (0, keyword_1.funcKeywordCode)(cxt, def);
	}
	var JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
	var RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
	function getData($data, { dataLevel, dataNames, dataPathArr }) {
		let jsonPointer;
		let data;
		if ($data === "") return names_1.default.rootData;
		if ($data[0] === "/") {
			if (!JSON_POINTER.test($data)) throw new Error(`Invalid JSON-pointer: ${$data}`);
			jsonPointer = $data;
			data = names_1.default.rootData;
		} else {
			const matches = RELATIVE_JSON_POINTER.exec($data);
			if (!matches) throw new Error(`Invalid JSON-pointer: ${$data}`);
			const up = +matches[1];
			jsonPointer = matches[2];
			if (jsonPointer === "#") {
				if (up >= dataLevel) throw new Error(errorMsg("property/index", up));
				return dataPathArr[dataLevel - up];
			}
			if (up > dataLevel) throw new Error(errorMsg("data", up));
			data = dataNames[dataLevel - up];
			if (!jsonPointer) return data;
		}
		let expr = data;
		const segments = jsonPointer.split("/");
		for (const segment of segments) if (segment) {
			data = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
			expr = (0, codegen_1._)`${expr} && ${data}`;
		}
		return expr;
		function errorMsg(pointerType, up) {
			return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
		}
	}
	exports.getData = getData;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/validation_error.js
var require_validation_error = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var ValidationError = class extends Error {
		constructor(errors) {
			super("validation failed");
			this.errors = errors;
			this.ajv = this.validation = true;
		}
	};
	exports.default = ValidationError;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/ref_error.js
var require_ref_error = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var resolve_1 = require_resolve();
	var MissingRefError = class extends Error {
		constructor(resolver, baseId, ref, msg) {
			super(msg || `can't resolve reference ${ref} from id ${baseId}`);
			this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref);
			this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
		}
	};
	exports.default = MissingRefError;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/index.js
var require_compile = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.resolveSchema = exports.getCompilingSchema = exports.resolveRef = exports.compileSchema = exports.SchemaEnv = void 0;
	var codegen_1 = require_codegen();
	var validation_error_1 = require_validation_error();
	var names_1 = require_names();
	var resolve_1 = require_resolve();
	var util_1 = require_util();
	var validate_1 = require_validate();
	var SchemaEnv = class {
		constructor(env) {
			var _a;
			this.refs = {};
			this.dynamicAnchors = {};
			let schema;
			if (typeof env.schema == "object") schema = env.schema;
			this.schema = env.schema;
			this.schemaId = env.schemaId;
			this.root = env.root || this;
			this.baseId = (_a = env.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema === null || schema === void 0 ? void 0 : schema[env.schemaId || "$id"]);
			this.schemaPath = env.schemaPath;
			this.localRefs = env.localRefs;
			this.meta = env.meta;
			this.$async = schema === null || schema === void 0 ? void 0 : schema.$async;
			this.refs = {};
		}
	};
	exports.SchemaEnv = SchemaEnv;
	function compileSchema(sch) {
		const _sch = getCompilingSchema.call(this, sch);
		if (_sch) return _sch;
		const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId);
		const { es5, lines } = this.opts.code;
		const { ownProperties } = this.opts;
		const gen = new codegen_1.CodeGen(this.scope, {
			es5,
			lines,
			ownProperties
		});
		let _ValidationError;
		if (sch.$async) _ValidationError = gen.scopeValue("Error", {
			ref: validation_error_1.default,
			code: (0, codegen_1._)`require("ajv/dist/runtime/validation_error").default`
		});
		const validateName = gen.scopeName("validate");
		sch.validateName = validateName;
		const schemaCxt = {
			gen,
			allErrors: this.opts.allErrors,
			data: names_1.default.data,
			parentData: names_1.default.parentData,
			parentDataProperty: names_1.default.parentDataProperty,
			dataNames: [names_1.default.data],
			dataPathArr: [codegen_1.nil],
			dataLevel: 0,
			dataTypes: [],
			definedProperties: /* @__PURE__ */ new Set(),
			topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? {
				ref: sch.schema,
				code: (0, codegen_1.stringify)(sch.schema)
			} : { ref: sch.schema }),
			validateName,
			ValidationError: _ValidationError,
			schema: sch.schema,
			schemaEnv: sch,
			rootId,
			baseId: sch.baseId || rootId,
			schemaPath: codegen_1.nil,
			errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
			errorPath: (0, codegen_1._)`""`,
			opts: this.opts,
			self: this
		};
		let sourceCode;
		try {
			this._compilations.add(sch);
			(0, validate_1.validateFunctionCode)(schemaCxt);
			gen.optimize(this.opts.code.optimize);
			const validateCode = gen.toString();
			sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
			if (this.opts.code.process) sourceCode = this.opts.code.process(sourceCode, sch);
			const validate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode)(this, this.scope.get());
			this.scope.value(validateName, { ref: validate });
			validate.errors = null;
			validate.schema = sch.schema;
			validate.schemaEnv = sch;
			if (sch.$async) validate.$async = true;
			if (this.opts.code.source === true) validate.source = {
				validateName,
				validateCode,
				scopeValues: gen._values
			};
			if (this.opts.unevaluated) {
				const { props, items } = schemaCxt;
				validate.evaluated = {
					props: props instanceof codegen_1.Name ? void 0 : props,
					items: items instanceof codegen_1.Name ? void 0 : items,
					dynamicProps: props instanceof codegen_1.Name,
					dynamicItems: items instanceof codegen_1.Name
				};
				if (validate.source) validate.source.evaluated = (0, codegen_1.stringify)(validate.evaluated);
			}
			sch.validate = validate;
			return sch;
		} catch (e) {
			delete sch.validate;
			delete sch.validateName;
			if (sourceCode) this.logger.error("Error compiling schema, function code:", sourceCode);
			throw e;
		} finally {
			this._compilations.delete(sch);
		}
	}
	exports.compileSchema = compileSchema;
	function resolveRef(root, baseId, ref) {
		var _a;
		ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref);
		const schOrFunc = root.refs[ref];
		if (schOrFunc) return schOrFunc;
		let _sch = resolve.call(this, root, ref);
		if (_sch === void 0) {
			const schema = (_a = root.localRefs) === null || _a === void 0 ? void 0 : _a[ref];
			const { schemaId } = this.opts;
			if (schema) _sch = new SchemaEnv({
				schema,
				schemaId,
				root,
				baseId
			});
		}
		if (_sch === void 0) return;
		return root.refs[ref] = inlineOrCompile.call(this, _sch);
	}
	exports.resolveRef = resolveRef;
	function inlineOrCompile(sch) {
		if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs)) return sch.schema;
		return sch.validate ? sch : compileSchema.call(this, sch);
	}
	function getCompilingSchema(schEnv) {
		for (const sch of this._compilations) if (sameSchemaEnv(sch, schEnv)) return sch;
	}
	exports.getCompilingSchema = getCompilingSchema;
	function sameSchemaEnv(s1, s2) {
		return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
	}
	function resolve(root, ref) {
		let sch;
		while (typeof (sch = this.refs[ref]) == "string") ref = sch;
		return sch || this.schemas[ref] || resolveSchema.call(this, root, ref);
	}
	function resolveSchema(root, ref) {
		const p = this.opts.uriResolver.parse(ref);
		const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
		let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, void 0);
		if (Object.keys(root.schema).length > 0 && refPath === baseId) return getJsonPointer.call(this, p, root);
		const id = (0, resolve_1.normalizeId)(refPath);
		const schOrRef = this.refs[id] || this.schemas[id];
		if (typeof schOrRef == "string") {
			const sch = resolveSchema.call(this, root, schOrRef);
			if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object") return;
			return getJsonPointer.call(this, p, sch);
		}
		if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object") return;
		if (!schOrRef.validate) compileSchema.call(this, schOrRef);
		if (id === (0, resolve_1.normalizeId)(ref)) {
			const { schema } = schOrRef;
			const { schemaId } = this.opts;
			const schId = schema[schemaId];
			if (schId) baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
			return new SchemaEnv({
				schema,
				schemaId,
				root,
				baseId
			});
		}
		return getJsonPointer.call(this, p, schOrRef);
	}
	exports.resolveSchema = resolveSchema;
	var PREVENT_SCOPE_CHANGE = /* @__PURE__ */ new Set([
		"properties",
		"patternProperties",
		"enum",
		"dependencies",
		"definitions"
	]);
	function getJsonPointer(parsedRef, { baseId, schema, root }) {
		var _a;
		if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/") return;
		for (const part of parsedRef.fragment.slice(1).split("/")) {
			if (typeof schema === "boolean") return;
			const partSchema = schema[(0, util_1.unescapeFragment)(part)];
			if (partSchema === void 0) return;
			schema = partSchema;
			const schId = typeof schema === "object" && schema[this.opts.schemaId];
			if (!PREVENT_SCOPE_CHANGE.has(part) && schId) baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
		}
		let env;
		if (typeof schema != "boolean" && schema.$ref && !(0, util_1.schemaHasRulesButRef)(schema, this.RULES)) {
			const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
			env = resolveSchema.call(this, root, $ref);
		}
		const { schemaId } = this.opts;
		env = env || new SchemaEnv({
			schema,
			schemaId,
			root,
			baseId
		});
		if (env.schema !== env.root.schema) return env;
	}
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/data.json
var data_exports = /* @__PURE__ */ __exportAll({
	$id: () => $id$9,
	additionalProperties: () => false,
	default: () => data_default,
	description: () => description,
	properties: () => properties$9,
	required: () => required,
	type: () => type$9
}), $id$9, description, type$9, required, properties$9, data_default;
var init_data = __esmMin((() => {
	$id$9 = "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#";
	description = "Meta-schema for $data reference (JSON AnySchema extension proposal)";
	type$9 = "object";
	required = ["$data"];
	properties$9 = { "$data": {
		"type": "string",
		"anyOf": [{ "format": "relative-json-pointer" }, { "format": "json-pointer" }]
	} };
	data_default = {
		$id: $id$9,
		description,
		type: type$9,
		required,
		properties: properties$9,
		additionalProperties: false
	};
}));
// node_modules/.pnpm/fast-uri@3.1.9/node_modules/fast-uri/lib/utils.js
var require_utils = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/** @type {(value: string) => boolean} */
	var isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);
	/** @type {(value: string) => boolean} */
	var isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
	/** @type {(value: string) => boolean} */
	var isPort = RegExp.prototype.test.bind(/^\d*$/u);
	/** @type {(value: string) => boolean} */
	var isHexPair = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu);
	/** @type {(value: string) => boolean} */
	var isUnreserved = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu);
	/** @type {(value: string) => boolean} */
	var isPathCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/]$/u);
	/** @type {(value: string) => boolean} */
	var isQueryFragmentCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/?]$/u);
	/** @type {(value: string) => boolean} */
	var isUserinfoCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:]$/u);
	var BYTE_HEX = new Array(256);
	{
		const HEX_DIGITS = "0123456789ABCDEF";
		for (let i = 0; i < 256; i++) BYTE_HEX[i] = "%" + HEX_DIGITS[i >> 4] + HEX_DIGITS[i & 15];
	}
	function percentEncodeNonAscii(cp) {
		if (cp < 2048) return BYTE_HEX[192 | cp >> 6] + BYTE_HEX[128 | cp & 63];
		if (cp < 65536) return BYTE_HEX[224 | cp >> 12] + BYTE_HEX[128 | cp >> 6 & 63] + BYTE_HEX[128 | cp & 63];
		return BYTE_HEX[240 | cp >> 18] + BYTE_HEX[128 | cp >> 12 & 63] + BYTE_HEX[128 | cp >> 6 & 63] + BYTE_HEX[128 | cp & 63];
	}
	/**
	* @param {Array<string>} input
	* @returns {string}
	*/
	function stringArrayToHexStripped(input) {
		let acc = "";
		let code = 0;
		let i = 0;
		for (i = 0; i < input.length; i++) {
			code = input[i].charCodeAt(0);
			if (code === 48) continue;
			if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) return "";
			acc += input[i];
			break;
		}
		for (i += 1; i < input.length; i++) {
			code = input[i].charCodeAt(0);
			if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) return "";
			acc += input[i];
		}
		return acc;
	}
	/** @type {(value: string) => boolean} */
	var isHextet = RegExp.prototype.test.bind(/^[\dA-Fa-f]{1,4}$/);
	/** @type {(value: string) => boolean} */
	var isIPvFuture = RegExp.prototype.test.bind(/^[vV][\dA-Fa-f]+\.[A-Za-z\d\-._~!$&'()*+,;=:]+$/);
	/** @type {(value: string) => boolean} */
	var isZoneCharacter = RegExp.prototype.test.bind(/^[A-Za-z\d\-._~]$/);
	/**
	* @param {string} value
	* @returns {boolean}
	*/
	var nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
	/**
	* @param {string} zone
	* @returns {boolean}
	*/
	function isZoneIdentifier(zone) {
		if (zone.length === 0) return false;
		for (let i = 0; i < zone.length; i++) {
			if (isZoneCharacter(zone[i])) continue;
			if (zone[i] === "%" && i + 2 < zone.length && isHexPair(zone.slice(i + 1, i + 3))) {
				i += 2;
				continue;
			}
			return false;
		}
		return true;
	}
	/**
	* Compresses the longest run of zero hextets to "::" per RFC 5952. A run of a
	* single zero hextet is left uncompressed. On ties the leftmost run wins.
	*
	* @param {string[]} hextets
	* @returns {string}
	*/
	function compressIPv6ZeroRun(hextets) {
		let bestStart = -1;
		let bestLength = 0;
		let runStart = -1;
		let runLength = 0;
		for (let i = 0; i < hextets.length; i++) if (hextets[i] === "0") {
			if (runStart === -1) runStart = i;
			runLength++;
			if (runLength > bestLength) {
				bestLength = runLength;
				bestStart = runStart;
			}
		} else {
			runStart = -1;
			runLength = 0;
		}
		if (bestLength < 2) return hextets.join(":");
		const head = hextets.slice(0, bestStart).join(":");
		const tail = hextets.slice(bestStart + bestLength).join(":");
		return head + "::" + tail;
	}
	/**
	* Validates an IPv6 address against the alternatives in RFC 3986 section
	* 3.2.2 and returns the same address with leading hextet zeroes removed.
	* An embedded IPv4 address counts as two hextets and is only valid at the end.
	*
	* @param {string} input
	* @returns {string|undefined}
	*/
	function normalizeIPv6Address(input) {
		const compression = input.indexOf("::");
		if (compression !== -1 && input.indexOf("::", compression + 1) !== -1) return void 0;
		const left = compression === -1 ? input.split(":") : input.slice(0, compression).split(":");
		const right = compression === -1 ? [] : input.slice(compression + 2).split(":");
		if (compression !== -1) {
			if (left.length === 1 && left[0] === "") left.length = 0;
			if (right.length === 1 && right[0] === "") right.length = 0;
		}
		const parts = left.concat(right);
		let hextetCount = 0;
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (part === "") return void 0;
			if (part.indexOf(".") !== -1) {
				if (i !== parts.length - 1 || compression !== -1 && right.length === 0 || !isIPv4(part)) return void 0;
				hextetCount += 2;
				continue;
			}
			if (!isHextet(part)) return void 0;
			parts[i] = parseInt(part, 16).toString(16);
			hextetCount++;
		}
		if (compression === -1) {
			if (hextetCount !== 8) return void 0;
			return compressIPv6ZeroRun(parts);
		}
		if (hextetCount >= 8) return void 0;
		const expanded = parts.slice(0, left.length);
		for (let i = hextetCount; i < 8; i++) expanded.push("0");
		for (let i = left.length; i < parts.length; i++) expanded.push(parts[i]);
		return compressIPv6ZeroRun(expanded);
	}
	/**
	* @typedef {Object} NormalizeIPv6Result
	* @property {string} host - The normalized host.
	* @property {string} [escapedHost] - The escaped host.
	* @property {boolean} isIPV6 - Indicates if the host is an IPv6 address.
	* @property {boolean} [isIPVFuture] - Indicates if the host is an IPvFuture literal.
	* @property {boolean} [error] - Indicates if a bracketed IP literal is malformed.
	*/
	/**
	* Validates and normalizes a bracketed IP literal. Raw zone separators remain
	* accepted for backwards compatibility, while encoded separators and zone
	* contents follow RFC 6874.
	*
	* @param {string} host
	* @returns {NormalizeIPv6Result}
	*/
	function normalizeIPv6(host) {
		const bracketed = host[0] === "[" && host[host.length - 1] === "]";
		if ((host[0] === "[" || host[host.length - 1] === "]") && !bracketed) return {
			host,
			isIPV6: false,
			error: true
		};
		let input = bracketed ? host.slice(1, -1) : host;
		if (bracketed && isIPvFuture(input)) {
			input = input.toLowerCase();
			return {
				host: `[${input}]`,
				escapedHost: input,
				isIPV6: false,
				isIPVFuture: true
			};
		}
		if (findToken(input, ":") < 2) return {
			host,
			isIPV6: false,
			error: bracketed
		};
		let zoneIdentifier = "";
		const zoneSeparator = input.indexOf("%");
		if (zoneSeparator !== -1) {
			const separatorLength = input.slice(zoneSeparator, zoneSeparator + 3).toLowerCase() === "%25" ? 3 : 1;
			zoneIdentifier = input.slice(zoneSeparator + separatorLength);
			if (!isZoneIdentifier(zoneIdentifier)) return {
				host,
				isIPV6: false,
				error: true
			};
			input = input.slice(0, zoneSeparator);
		}
		const address = normalizeIPv6Address(input);
		if (address === void 0) return {
			host,
			isIPV6: false,
			error: true
		};
		return {
			host: address + (zoneIdentifier ? "%" + zoneIdentifier : ""),
			escapedHost: address + (zoneIdentifier ? "%25" + zoneIdentifier : ""),
			isIPV6: true
		};
	}
	/**
	* @param {string} str
	* @param {string} token
	* @returns {number}
	*/
	function findToken(str, token) {
		let ind = 0;
		for (let i = 0; i < str.length; i++) if (str[i] === token) ind++;
		return ind;
	}
	/**
	* @param {string} path
	* @returns {string}
	*
	* @see https://datatracker.ietf.org/doc/html/rfc3986#section-5.2.4
	*/
	function removeDotSegments(path) {
		let input = path;
		const output = [];
		let nextSlash = -1;
		let len = 0;
		while (len = input.length) {
			if (len === 1) {
				if (input === ".") break;
				else if (input === "/") {
					output.push("/");
					break;
				} else {
					output.push(input);
					break;
				}
			} else if (len === 2) {
				if (input[0] === ".") {
					if (input[1] === ".") break;
					else if (input[1] === "/") {
						input = input.slice(2);
						continue;
					}
				} else if (input[0] === "/") {
					if (input[1] === "." || input[1] === "/") {
						output.push("/");
						break;
					}
				}
			} else if (len === 3) {
				if (input === "/..") {
					if (output.length !== 0) output.pop();
					output.push("/");
					break;
				}
			}
			if (input[0] === ".") {
				if (input[1] === ".") {
					if (input[2] === "/") {
						input = input.slice(3);
						continue;
					}
				} else if (input[1] === "/") {
					input = input.slice(2);
					continue;
				}
			} else if (input[0] === "/") {
				if (input[1] === ".") {
					if (input[2] === "/") {
						input = input.slice(2);
						continue;
					} else if (input[2] === ".") {
						if (input[3] === "/") {
							input = input.slice(3);
							if (output.length !== 0) output.pop();
							continue;
						}
					}
				}
			}
			if ((nextSlash = input.indexOf("/", 1)) === -1) {
				output.push(input);
				break;
			} else {
				output.push(input.slice(0, nextSlash));
				input = input.slice(nextSlash);
			}
		}
		return output.join("");
	}
	/**
	* Removes dot segments from the path of a relative reference (a path that does
	* not start with "/") without changing what it resolves to against any base.
	* Unlike `removeDotSegments`, leading ".." segments that cannot be collapsed
	* are kept, the result never becomes root-relative, and a result that would be
	* empty or start with an empty segment is prefixed with "." (an empty path
	* means "same document" and a leading "//" would introduce an authority).
	*
	* @param {string} path
	* @returns {string}
	*/
	function removeDotSegmentsRelative(path) {
		if (path === "" || path[0] === "/") return removeDotSegments(path);
		const segments = path.split("/");
		const last = segments.length - 1;
		/** @type {string[]} */
		const output = [];
		let trailingDirectory = false;
		for (let i = 0; i <= last; i++) {
			const segment = segments[i];
			if (segment === "." || segment === "..") {
				if (segment === "..") {
					if (output.length !== 0 && output[output.length - 1] !== "..") output.pop();
					else output.push("..");
				}
				trailingDirectory = i === last;
			} else output.push(segment);
		}
		if (trailingDirectory && output[output.length - 1] !== "..") output.push("");
		if (output.length === 0 || output[0] === "" || output[0].includes(":")) output.unshift(".");
		return output.join("/");
	}
	/**
	* Re-escape RFC 3986 gen-delims that must not appear literally in the host.
	* After the URI regex parses, these characters cannot be literal in the host
	* field, so any that appear after decoding came from percent-encoding and
	* must be restored to prevent authority structure changes.
	*
	* @param {string} host
	* @param {boolean} isIP - true for IPv4/IPv6 hosts (skip colon re-escaping)
	* @returns {string}
	*/
	var HOST_DELIMS = {
		"@": "%40",
		"/": "%2F",
		"?": "%3F",
		"#": "%23",
		":": "%3A"
	};
	var HOST_DELIM_RE = /[@/?#:]/g;
	var HOST_DELIM_NO_COLON_RE = /[@/?#]/g;
	function reescapeHostDelimiters(host, isIP) {
		const re = isIP ? HOST_DELIM_NO_COLON_RE : HOST_DELIM_RE;
		re.lastIndex = 0;
		return host.replace(re, (ch) => HOST_DELIMS[ch]);
	}
	/**
	* Normalizes percent escapes and optionally decodes only unreserved ASCII bytes.
	* Reserved delimiters such as `%2F` stay escaped; `%2E` is unreserved.
	*
	* @param {string} input
	* @param {boolean} [decodeUnreserved=false]
	* @returns {string}
	*/
	function normalizePercentEncoding(input, decodeUnreserved = false) {
		if (input.indexOf("%") === -1) return input;
		let output = "";
		for (let i = 0; i < input.length; i++) {
			if (input[i] === "%" && i + 2 < input.length) {
				const hex = input.slice(i + 1, i + 3);
				if (isHexPair(hex)) {
					const normalizedHex = hex.toUpperCase();
					const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
					if (decodeUnreserved && isUnreserved(decoded)) output += decoded;
					else output += "%" + normalizedHex;
					i += 2;
					continue;
				}
			}
			output += input[i];
		}
		return output;
	}
	/**
	* Normalizes path data without turning reserved escapes into live path syntax.
	* Valid escapes are uppercased, raw unsafe characters are escaped, and only
	* unreserved bytes that are not `.` are decoded.
	*
	* @param {string} input
	* @returns {string}
	*/
	function normalizePathEncoding(input) {
		let output = "";
		for (let i = 0; i < input.length; i++) {
			const ch = input[i];
			if (ch === "%" && i + 2 < input.length) {
				const hex = input.slice(i + 1, i + 3);
				if (isHexPair(hex)) {
					const normalizedHex = hex.toUpperCase();
					const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
					if (decoded !== "." && isUnreserved(decoded)) output += decoded;
					else output += "%" + normalizedHex;
					i += 2;
					continue;
				}
			}
			if (isPathCharacter(ch)) output += ch;
			else {
				const code = input.charCodeAt(i);
				if (code < 128) output += isEscapeSafe(code) ? ch : BYTE_HEX[code];
				else if (code < 55296 || code > 57343) output += percentEncodeNonAscii(code);
				else if (code <= 56319 && i + 1 < input.length) {
					const low = input.charCodeAt(i + 1);
					if (low >= 56320 && low <= 57343) {
						output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
						i++;
					} else output += percentEncodeNonAscii(65533);
				} else output += percentEncodeNonAscii(65533);
			}
		}
		return output;
	}
	/**
	* Serializes a path without rewriting reserved data. Raw RFC 3986 path
	* characters remain literal, valid escapes are preserved and uppercased, and
	* everything else is UTF-8 percent-encoded. In a path-noscheme, a colon in the
	* first segment must be escaped so the result cannot be parsed as a scheme.
	*
	* @param {string} input
	* @param {boolean} [pathNoScheme=false]
	* @returns {string}
	*/
	function serializePathEncoding(input, pathNoScheme = false) {
		let output = "";
		let firstSegment = pathNoScheme && input[0] !== "/";
		for (let i = 0; i < input.length; i++) {
			const ch = input[i];
			if (ch === "%" && i + 2 < input.length) {
				const hex = input.slice(i + 1, i + 3);
				if (isHexPair(hex)) {
					output += "%" + hex.toUpperCase();
					i += 2;
					continue;
				}
			}
			if (ch === "/") firstSegment = false;
			if (isPathCharacter(ch) && (ch !== ":" || !firstSegment)) output += ch;
			else {
				const code = input.charCodeAt(i);
				if (code < 128) output += BYTE_HEX[code];
				else if (code < 55296 || code > 57343) output += percentEncodeNonAscii(code);
				else if (code <= 56319 && i + 1 < input.length) {
					const low = input.charCodeAt(i + 1);
					if (low >= 56320 && low <= 57343) {
						output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
						i++;
					} else output += percentEncodeNonAscii(65533);
				} else output += percentEncodeNonAscii(65533);
			}
		}
		return output;
	}
	/**
	* Percent-encodes a URI component using its RFC 3986 literal character set.
	* Existing valid escapes are preserved and normalized to uppercase hex.
	*
	* @param {string} input
	* @param {(value: string) => boolean} isAllowed
	* @returns {string}
	*/
	function encodeComponent(input, isAllowed) {
		let output = "";
		for (let i = 0; i < input.length; i++) {
			const ch = input[i];
			if (ch === "%" && i + 2 < input.length) {
				const hex = input.slice(i + 1, i + 3);
				if (isHexPair(hex)) {
					output += "%" + hex.toUpperCase();
					i += 2;
					continue;
				}
			}
			if (isAllowed(ch)) output += ch;
			else {
				const code = input.charCodeAt(i);
				if (code < 128) output += BYTE_HEX[code];
				else if (code < 55296 || code > 57343) output += percentEncodeNonAscii(code);
				else if (code <= 56319 && i + 1 < input.length) {
					const low = input.charCodeAt(i + 1);
					if (low >= 56320 && low <= 57343) {
						output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
						i++;
					} else output += percentEncodeNonAscii(65533);
				} else output += percentEncodeNonAscii(65533);
			}
		}
		return output;
	}
	/**
	* Encodes userinfo while preserving its RFC 3986 §3.2.1 literal characters.
	* In particular, authority delimiters such as `@`, `/`, `?`, and `#` are data.
	*
	* @param {string} input
	* @returns {string}
	*/
	function encodeUserinfo(input) {
		return encodeComponent(input, isUserinfoCharacter);
	}
	/**
	* Encodes query data using the RFC 3986 §3.4 grammar. A literal `#` must be
	* escaped because it would otherwise begin the fragment component.
	*
	* @param {string} input
	* @returns {string}
	*/
	function encodeQuery(input) {
		return encodeComponent(input, isQueryFragmentCharacter);
	}
	/**
	* Encodes fragment data using the RFC 3986 §3.5 grammar.
	*
	* @param {string} input
	* @returns {string}
	*/
	function encodeFragment(input) {
		return encodeComponent(input, isQueryFragmentCharacter);
	}
	function isEscapeSafe(cp) {
		return cp >= 48 && cp <= 57 || cp >= 65 && cp <= 90 || cp >= 97 && cp <= 122 || cp === 42 || cp === 43 || cp === 45 || cp === 46 || cp === 47 || cp === 64 || cp === 95;
	}
	/**
	* Normalizes the percent-encoding of a query or fragment component.
	*
	* Like `normalizePathEncoding`, but uses the query/fragment character set
	* (which additionally allows `?`) and decodes `.` since it has no dot-segment
	* meaning outside of a path.
	*
	* @param {string} input
	* @returns {string}
	*/
	function normalizeQueryFragmentEncoding(input) {
		let output = "";
		for (let i = 0; i < input.length; i++) {
			const ch = input[i];
			if (ch === "%" && i + 2 < input.length) {
				const hex = input.slice(i + 1, i + 3);
				if (isHexPair(hex)) {
					const normalizedHex = hex.toUpperCase();
					const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
					if (isUnreserved(decoded)) output += decoded;
					else output += "%" + normalizedHex;
					i += 2;
					continue;
				}
			}
			if (isQueryFragmentCharacter(ch)) output += ch;
			else {
				const code = input.charCodeAt(i);
				if (code < 128) output += isEscapeSafe(code) ? ch : BYTE_HEX[code];
				else if (code < 55296 || code > 57343) output += percentEncodeNonAscii(code);
				else if (code <= 56319 && i + 1 < input.length) {
					const low = input.charCodeAt(i + 1);
					if (low >= 56320 && low <= 57343) {
						output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
						i++;
					} else output += percentEncodeNonAscii(65533);
				} else output += percentEncodeNonAscii(65533);
			}
		}
		return output;
	}
	/**
	* Escapes a component while preserving existing valid percent escapes.
	*
	* @param {string} input
	* @returns {string}
	*/
	function escapePreservingEscapes(input) {
		let output = "";
		for (let i = 0; i < input.length; i++) {
			if (input[i] === "%" && i + 2 < input.length) {
				const hex = input.slice(i + 1, i + 3);
				if (isHexPair(hex)) {
					output += "%" + hex.toUpperCase();
					i += 2;
					continue;
				}
			}
			output += escape(input[i]);
		}
		return output;
	}
	/**
	* @param {import('../types/index').URIComponent} component
	* @returns {string|undefined}
	*/
	function recomposeAuthority(component) {
		const uriTokens = [];
		if (component.userinfo !== void 0) {
			uriTokens.push(encodeUserinfo(component.userinfo));
			uriTokens.push("@");
		}
		if (component.host !== void 0) {
			let host = component.host;
			if (!isIPv4(host)) {
				let ipV6res = normalizeIPv6(host);
				if (ipV6res.isIPV6 !== true && ipV6res.isIPVFuture !== true) {
					host = normalizePercentEncoding(host, true);
					ipV6res = normalizeIPv6(host);
				}
				if (ipV6res.isIPV6 === true || ipV6res.isIPVFuture === true) host = `[${ipV6res.escapedHost}]`;
				else host = reescapeHostDelimiters(host, false);
			}
			uriTokens.push(host);
		}
		if (typeof component.port === "number" || typeof component.port === "string") {
			const port = String(component.port);
			if (!isPort(port)) throw new TypeError("URI port is malformed.");
			uriTokens.push(":");
			uriTokens.push(port);
		}
		return uriTokens.length ? uriTokens.join("") : void 0;
	}
	module.exports = {
		nonSimpleDomain,
		recomposeAuthority,
		reescapeHostDelimiters,
		normalizePercentEncoding,
		normalizePathEncoding,
		serializePathEncoding,
		normalizeQueryFragmentEncoding,
		encodeUserinfo,
		encodeQuery,
		encodeFragment,
		escapePreservingEscapes,
		removeDotSegments,
		removeDotSegmentsRelative,
		isIPv4,
		isUUID,
		normalizeIPv6,
		stringArrayToHexStripped
	};
}));
// node_modules/.pnpm/fast-uri@3.1.9/node_modules/fast-uri/lib/schemes.js
var require_schemes = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var { isUUID } = require_utils();
	var URN_REG = /^([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-./:;=@]|%[\da-f]{2})+)$/iu;
	var supportedSchemeNames = [
		"http",
		"https",
		"ws",
		"wss",
		"urn",
		"urn:uuid"
	];
	/** @typedef {supportedSchemeNames[number]} SchemeName */
	/**
	* @param {string} name
	* @returns {name is SchemeName}
	*/
	function isValidSchemeName(name) {
		return supportedSchemeNames.indexOf(name) !== -1;
	}
	/**
	* @callback SchemeFn
	* @param {import('../types/index').URIComponent} component
	* @param {import('../types/index').Options} options
	* @returns {import('../types/index').URIComponent}
	*/
	/**
	* @typedef {Object} SchemeHandler
	* @property {SchemeName} scheme - The scheme name.
	* @property {boolean} [domainHost] - Indicates if the scheme supports domain hosts.
	* @property {SchemeFn} parse - Function to parse the URI component for this scheme.
	* @property {SchemeFn} serialize - Function to serialize the URI component for this scheme.
	* @property {boolean} [skipNormalize] - Indicates if normalization should be skipped for this scheme.
	* @property {boolean} [absolutePath] - Indicates if the scheme uses absolute paths.
	* @property {boolean} [unicodeSupport] - Indicates if the scheme supports Unicode.
	*/
	/**
	* @param {import('../types/index').URIComponent} wsComponent
	* @returns {boolean}
	*/
	function wsIsSecure(wsComponent) {
		if (wsComponent.secure === true) return true;
		else if (wsComponent.secure === false) return false;
		else if (wsComponent.scheme) return wsComponent.scheme.length === 3 && (wsComponent.scheme[0] === "w" || wsComponent.scheme[0] === "W") && (wsComponent.scheme[1] === "s" || wsComponent.scheme[1] === "S") && (wsComponent.scheme[2] === "s" || wsComponent.scheme[2] === "S");
		else return false;
	}
	/** @type {SchemeFn} */
	function httpParse(component) {
		if (!component.host) component.error = component.error || "HTTP URIs must have a host.";
		return component;
	}
	/** @type {SchemeFn} */
	function httpSerialize(component) {
		const secure = String(component.scheme).toLowerCase() === "https";
		if (component.port === (secure ? 443 : 80) || component.port === "") component.port = void 0;
		if (!component.path) component.path = "/";
		return component;
	}
	/** @type {SchemeFn} */
	function wsParse(wsComponent) {
		wsComponent.secure = wsIsSecure(wsComponent);
		wsComponent.resourceName = (wsComponent.path || "/") + (wsComponent.query ? "?" + wsComponent.query : "");
		wsComponent.path = void 0;
		wsComponent.query = void 0;
		return wsComponent;
	}
	/** @type {SchemeFn} */
	function wsSerialize(wsComponent) {
		if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === "") wsComponent.port = void 0;
		if (typeof wsComponent.secure === "boolean") {
			wsComponent.scheme = wsComponent.secure ? "wss" : "ws";
			wsComponent.secure = void 0;
		}
		if (wsComponent.resourceName) {
			const queryIndex = wsComponent.resourceName.indexOf("?");
			const path = queryIndex === -1 ? wsComponent.resourceName : wsComponent.resourceName.slice(0, queryIndex);
			wsComponent.path = path && path !== "/" ? path : void 0;
			wsComponent.query = queryIndex === -1 ? void 0 : wsComponent.resourceName.slice(queryIndex + 1);
			wsComponent.resourceName = void 0;
		}
		wsComponent.fragment = void 0;
		return wsComponent;
	}
	/** @type {SchemeFn} */
	function urnParse(urnComponent, options) {
		if (!urnComponent.path) {
			urnComponent.error = "URN can not be parsed";
			return urnComponent;
		}
		const matches = urnComponent.path.match(URN_REG);
		if (matches && matches[0] === urnComponent.path) {
			const scheme = options.scheme || urnComponent.scheme || "urn";
			urnComponent.nid = matches[1].toLowerCase();
			urnComponent.nss = matches[2];
			const schemeHandler = getSchemeHandler(`${scheme}:${options.nid || urnComponent.nid}`);
			urnComponent.path = void 0;
			if (schemeHandler) urnComponent = schemeHandler.parse(urnComponent, options);
		} else urnComponent.error = urnComponent.error || "URN can not be parsed.";
		return urnComponent;
	}
	/** @type {SchemeFn} */
	function urnSerialize(urnComponent, options) {
		if (urnComponent.nid === void 0) throw new Error("URN without nid cannot be serialized");
		const scheme = options.scheme || urnComponent.scheme || "urn";
		const nid = urnComponent.nid.toLowerCase();
		const schemeHandler = getSchemeHandler(`${scheme}:${options.nid || nid}`);
		if (schemeHandler) urnComponent = schemeHandler.serialize(urnComponent, options);
		const uriComponent = urnComponent;
		const nss = urnComponent.nss;
		uriComponent.path = `${nid || options.nid}:${nss}`;
		options.skipEscape = true;
		return uriComponent;
	}
	/** @type {SchemeFn} */
	function urnuuidParse(urnComponent, options) {
		const uuidComponent = urnComponent;
		uuidComponent.uuid = uuidComponent.nss;
		uuidComponent.nss = void 0;
		if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) uuidComponent.error = uuidComponent.error || "UUID is not valid.";
		return uuidComponent;
	}
	/** @type {SchemeFn} */
	function urnuuidSerialize(uuidComponent) {
		const urnComponent = uuidComponent;
		urnComponent.nss = (uuidComponent.uuid || "").toLowerCase();
		return urnComponent;
	}
	var http = {
		scheme: "http",
		domainHost: true,
		parse: httpParse,
		serialize: httpSerialize
	};
	var https = {
		scheme: "https",
		domainHost: http.domainHost,
		parse: httpParse,
		serialize: httpSerialize
	};
	var ws = {
		scheme: "ws",
		domainHost: true,
		parse: wsParse,
		serialize: wsSerialize
	};
	var SCHEMES = {
		http,
		https,
		ws,
		wss: {
			scheme: "wss",
			domainHost: ws.domainHost,
			parse: ws.parse,
			serialize: ws.serialize
		},
		urn: {
			scheme: "urn",
			parse: urnParse,
			serialize: urnSerialize,
			skipNormalize: true
		},
		"urn:uuid": {
			scheme: "urn:uuid",
			parse: urnuuidParse,
			serialize: urnuuidSerialize,
			skipNormalize: true
		}
	};
	Object.setPrototypeOf(SCHEMES, null);
	/**
	* @param {string|undefined} scheme
	* @returns {SchemeHandler|undefined}
	*/
	function getSchemeHandler(scheme) {
		return scheme && (SCHEMES[scheme] || SCHEMES[scheme.toLowerCase()]) || void 0;
	}
	module.exports = {
		wsIsSecure,
		SCHEMES,
		isValidSchemeName,
		getSchemeHandler
	};
}));
// node_modules/.pnpm/fast-uri@3.1.9/node_modules/fast-uri/index.js
var require_fast_uri = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var { normalizeIPv6, removeDotSegments, removeDotSegmentsRelative, recomposeAuthority, normalizePercentEncoding, normalizePathEncoding, serializePathEncoding, normalizeQueryFragmentEncoding, encodeQuery, encodeFragment, reescapeHostDelimiters, isIPv4, nonSimpleDomain } = require_utils();
	var { SCHEMES, getSchemeHandler } = require_schemes();
	var VALID_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*$/u;
	var MALFORMED_SCHEME_ERROR = "URI scheme is malformed.";
	var MALFORMED_HOST_ERROR = "URI host is malformed.";
	var FORBIDDEN_DOMAIN_HOST_CHARACTER = /[\0-\x20"#/:<>?@[\\\]^`{|}\x7F]/u;
	/**
	* RFC 3986 section 3.1 does not allow percent-encoding in a scheme, so the
	* scheme is validated as-is and never decoded. Decoding would let inert input
	* such as `%6Aavascript:` become a live `javascript:` scheme.
	*
	* @param {string} scheme
	* @returns {string}
	*/
	function validateScheme(scheme) {
		const stringScheme = String(scheme);
		if (!VALID_SCHEME.test(stringScheme)) throw new TypeError(MALFORMED_SCHEME_ERROR);
		return stringScheme;
	}
	/**
	* @template {import('./types/index').URIComponent|string} T
	* @param {T} uri
	* @param {import('./types/index').Options} [options]
	* @returns {T}
	*/
	function normalize(uri, options) {
		if (typeof uri === "string") uri = normalizeString(uri, options);
		else if (typeof uri === "object") uri = parse(serialize(uri, options), options);
		return uri;
	}
	/**
	* @param {string} baseURI
	* @param {string} relativeURI
	* @param {import('./types/index').Options} [options]
	* @returns {string}
	*/
	function resolve(baseURI, relativeURI, options) {
		const schemelessOptions = options ? Object.assign({ scheme: "null" }, options) : { scheme: "null" };
		const { parsed: baseParsed, malformedAuthorityOrPort: baseMalformed, malformedPercentEncoding: baseMalformedPercentEncoding, malformedSchemeSpecific: baseMalformedSchemeSpecific, malformedHost: baseMalformedHost, malformedScheme: baseMalformedScheme } = parseWithStatus(baseURI, schemelessOptions);
		const { parsed: relativeParsed, malformedAuthorityOrPort: relativeMalformed, malformedPercentEncoding: relativeMalformedPercentEncoding, malformedSchemeSpecific: relativeMalformedSchemeSpecific, malformedHost: relativeMalformedHost, malformedScheme: relativeMalformedScheme } = parseWithStatus(relativeURI, schemelessOptions);
		if (baseMalformed || relativeMalformed || baseMalformedPercentEncoding || relativeMalformedPercentEncoding || baseMalformedSchemeSpecific || relativeMalformedSchemeSpecific || baseMalformedHost || relativeMalformedHost || baseMalformedScheme || relativeMalformedScheme) throw new Error(baseParsed.error || relativeParsed.error || "URI is malformed.");
		const resolved = resolveComponent(baseParsed, relativeParsed, schemelessOptions, true);
		const resolvedSchemeHandler = getSchemeHandler(options && options.scheme || resolved.scheme);
		const resolvedHost = resolved.host;
		const resolvedHostIsIP = resolvedHost !== void 0 && resolvedHost !== "" && (isIPv4(resolvedHost) || normalizeIPv6(resolvedHost).isIPV6);
		if (hasForbiddenDomainHost(resolved, options || {}, resolvedSchemeHandler, resolvedHostIsIP)) throw new Error(MALFORMED_HOST_ERROR);
		canonicalizeHost(resolved, options || {}, resolvedSchemeHandler, resolvedHostIsIP);
		const encodedASCIIHost = resolvedHost && resolvedHost.indexOf("%") !== -1 && !/\P{ASCII}/u.test(resolvedHost);
		if (resolved.error && !encodedASCIIHost) throw new Error(resolved.error);
		schemelessOptions.skipEscape = true;
		return serialize(resolved, schemelessOptions);
	}
	/**
	* @param {import ('./types/index').URIComponent} base
	* @param {import ('./types/index').URIComponent} relative
	* @param {import('./types/index').Options} [options]
	* @param {boolean} [skipNormalization=false]
	* @returns {import ('./types/index').URIComponent}
	*/
	function resolveComponent(base, relative, options, skipNormalization) {
		/** @type {import('./types/index').URIComponent} */
		const target = {};
		if (!skipNormalization) {
			base = parse(serialize(base, options), options);
			relative = parse(serialize(relative, options), options);
		}
		options = options || {};
		if (!options.tolerant && relative.scheme) {
			target.scheme = relative.scheme;
			target.userinfo = relative.userinfo;
			target.host = relative.host;
			target.port = relative.port;
			target.path = removeDotSegments(relative.path || "");
			target.query = relative.query;
		} else {
			if (relative.userinfo !== void 0 || relative.host !== void 0 || relative.port !== void 0) {
				target.userinfo = relative.userinfo;
				target.host = relative.host;
				target.port = relative.port;
				target.path = removeDotSegments(relative.path || "");
				target.query = relative.query;
			} else {
				if (!relative.path) {
					target.path = base.path;
					if (relative.query !== void 0) target.query = relative.query;
					else target.query = base.query;
				} else {
					if (relative.path[0] === "/") target.path = removeDotSegments(relative.path);
					else {
						const baseHasAuthority = base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0;
						if (baseHasAuthority && !base.path) target.path = "/" + relative.path;
						else if (!base.path) target.path = relative.path;
						else target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative.path;
						target.path = base.scheme === void 0 && !baseHasAuthority && target.path[0] !== "/" ? removeDotSegmentsRelative(target.path) : removeDotSegments(target.path);
					}
					target.query = relative.query;
				}
				target.userinfo = base.userinfo;
				target.host = base.host;
				target.port = base.port;
			}
			target.scheme = base.scheme;
		}
		target.fragment = relative.fragment;
		return target;
	}
	/**
	* @param {import ('./types/index').URIComponent|string} uriA
	* @param {import ('./types/index').URIComponent|string} uriB
	* @param {import ('./types/index').Options} options
	* @returns {boolean}
	*/
	function equal(uriA, uriB, options) {
		const normalizedA = normalizeComparableURI(uriA, options);
		const normalizedB = normalizeComparableURI(uriB, options);
		return normalizedA !== void 0 && normalizedB !== void 0 && normalizedA === normalizedB;
	}
	/**
	* @param {Readonly<import('./types/index').URIComponent>} cmpts
	* @param {import('./types/index').Options} [opts]
	* @returns {string}
	*/
	function serialize(cmpts, opts) {
		const component = {
			host: cmpts.host,
			scheme: cmpts.scheme,
			userinfo: cmpts.userinfo,
			port: cmpts.port,
			path: cmpts.path,
			query: cmpts.query,
			nid: cmpts.nid,
			nss: cmpts.nss,
			uuid: cmpts.uuid,
			fragment: cmpts.fragment,
			reference: cmpts.reference,
			resourceName: cmpts.resourceName,
			secure: cmpts.secure,
			error: ""
		};
		const options = Object.assign({}, opts);
		const uriTokens = [];
		if (component.scheme) component.scheme = validateScheme(component.scheme);
		const schemeHandler = getSchemeHandler(options.scheme || component.scheme);
		if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(component, options);
		const hasAuthority = component.userinfo !== void 0 || component.host !== void 0 || component.port !== void 0;
		const schemelessReference = (component.scheme === void 0 || options.reference === "suffix") && !hasAuthority;
		const pathNoScheme = !options.skipEscape && schemelessReference;
		if (component.path !== void 0) {
			if (!options.skipEscape) component.path = serializePathEncoding(component.path, pathNoScheme);
			else component.path = normalizePercentEncoding(component.path);
		}
		if (options.reference !== "suffix" && component.scheme) {
			component.scheme = validateScheme(component.scheme);
			uriTokens.push(component.scheme, ":");
		}
		const authority = recomposeAuthority(component);
		if (authority !== void 0) {
			if (options.reference !== "suffix") uriTokens.push("//");
			uriTokens.push(authority);
			if (component.path && component.path[0] !== "/") uriTokens.push("/");
		}
		if (component.path !== void 0) {
			let s = component.path;
			if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) s = schemelessReference && s[0] !== "/" ? removeDotSegmentsRelative(s) : removeDotSegments(s);
			if (schemelessReference) s = serializePathEncoding(s, true);
			if (authority === void 0 && s[0] === "/" && s[1] === "/") s = "/%2F" + s.slice(2);
			uriTokens.push(s);
		}
		if (component.query !== void 0) uriTokens.push("?", encodeQuery(component.query));
		if (component.fragment !== void 0) uriTokens.push("#", encodeFragment(component.fragment));
		return uriTokens.join("");
	}
	var URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
	var AUTHORITY_PREFIX = /^(?:[^#/:?]+:)?\/\/([^/?#]*)/;
	var AUTHORITY_INTRODUCER_REGION = /^(?:[^#/:?]+:)?([/\\\t\n\r]*)/;
	/**
	* @param {import('./types/index').URIComponent} parsed
	* @param {RegExpMatchArray} matches
	* @returns {string|undefined}
	*/
	function getParseError(parsed, matches) {
		if (matches[2] !== void 0 && parsed.path && parsed.path[0] !== "/") return "URI path must start with \"/\" when authority is present.";
		if (typeof parsed.port === "number" && (parsed.port < 0 || parsed.port > 65535)) return "URI port is malformed.";
	}
	/**
	* Checks percent syntax without decoding the represented octets. RFC 3986
	* percent-encoding is byte-oriented, so sequences such as `%FF` are valid even
	* though they are not independently valid UTF-8.
	*
	* @param {string|undefined} component
	* @returns {boolean}
	*/
	function hasMalformedPercentEncoding(component) {
		if (component === void 0) return false;
		let percent = component.indexOf("%");
		while (percent !== -1) {
			if (percent + 2 >= component.length || !/^[\da-f]{2}$/iu.test(component.slice(percent + 1, percent + 3))) return true;
			percent = component.indexOf("%", percent + 3);
		}
		return false;
	}
	/**
	* Whether the host is a bracketed IP literal (RFC 3986 `IP-literal`).
	* An unterminated `[` is not a literal, so it must still be validated as a
	* reg-name instead of being waved through as an IP.
	*
	* @param {string} host
	* @returns {boolean}
	*/
	function isIPLiteral(host) {
		return host[0] === "[" && host[host.length - 1] === "]";
	}
	/**
	* @param {RegExpMatchArray} matches
	* @returns {boolean}
	*/
	function hasMalformedComponentPercentEncoding(matches) {
		const host = matches[4];
		return hasMalformedPercentEncoding(matches[3]) || host !== void 0 && !isIPLiteral(host) && hasMalformedPercentEncoding(host) || hasMalformedPercentEncoding(matches[6]) || hasMalformedPercentEncoding(matches[7]) || hasMalformedPercentEncoding(matches[8]);
	}
	/**
	* @param {import('./types/index').URIComponent} parsed
	* @param {import('./types/index').Options} options
	* @param {{ domainHost?: boolean, unicodeSupport?: boolean }|undefined} schemeHandler
	* @param {boolean} isIP
	* @returns {boolean} whether host conversion failed
	*/
	function canonicalizeHost(parsed, options, schemeHandler, isIP) {
		if (hasForbiddenDomainHost(parsed, options, schemeHandler, isIP)) {
			parsed.error = parsed.error || MALFORMED_HOST_ERROR;
			return true;
		}
		if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport) && parsed.host && !isIPLiteral(parsed.host) && (options.domainHost || schemeHandler && schemeHandler.domainHost) && isIP === false && nonSimpleDomain(parsed.host)) {
			let url;
			try {
				url = new URL("http://" + parsed.host);
			} catch (e) {
				parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
				return true;
			}
			if (!isHostOnlyURL(url)) {
				parsed.error = parsed.error || MALFORMED_HOST_ERROR;
				return true;
			}
			parsed.host = url.hostname;
		}
		return false;
	}
	/**
	* Whether a domain host contains an ASCII character that RFC 3986 does not
	* allow in a reg-name (unreserved, sub-delims, or pct-encoded). Such a host is
	* rejected instead of being handed to the WHATWG URL parser, which would treat
	* "@" as a userinfo delimiter (silently dropping the data before it) and strip
	* TAB, LF, and CR. Non-ASCII characters remain allowed for IDNs.
	*
	* @param {import('./types/index').URIComponent} parsed
	* @param {import('./types/index').Options} options
	* @param {{ domainHost?: boolean }|undefined} schemeHandler
	* @param {boolean} isIP
	* @returns {boolean}
	*/
	function hasForbiddenDomainHost(parsed, options, schemeHandler, isIP) {
		return Boolean(parsed.host && isIP === false && !isIPLiteral(parsed.host) && (options.domainHost || schemeHandler && schemeHandler.domainHost) && FORBIDDEN_DOMAIN_HOST_CHARACTER.test(parsed.host));
	}
	/**
	* @param {URL} url
	* @returns {boolean}
	*/
	function isHostOnlyURL(url) {
		return url.username === "" && url.password === "" && url.port === "" && url.pathname === "/" && url.search === "" && url.hash === "" && url.hostname !== "";
	}
	/**
	* @param {string} uri
	* @param {import('./types/index').Options} [opts]
	* @returns {{ parsed: import('./types/index').URIComponent, malformedAuthorityOrPort: boolean, malformedPercentEncoding: boolean, malformedSchemeSpecific: boolean, malformedHost: boolean, malformedScheme: boolean }}
	*/
	function parseWithStatus(uri, opts) {
		const options = Object.assign({}, opts);
		/** @type {import('./types/index').URIComponent} */
		const parsed = {
			scheme: void 0,
			userinfo: void 0,
			host: "",
			port: void 0,
			path: "",
			query: void 0,
			fragment: void 0
		};
		let malformedAuthorityOrPort = false;
		let malformedPercentEncoding = false;
		let malformedSchemeSpecific = false;
		let malformedHost = false;
		let malformedIPLiteral = false;
		let malformedScheme = false;
		let isIP = false;
		if (options.reference === "suffix") {
			if (options.scheme) uri = options.scheme + ":" + uri;
			else uri = "//" + uri;
		}
		const authorityMatch = uri.match(AUTHORITY_PREFIX);
		if (authorityMatch !== null && authorityMatch[1].indexOf("\\") !== -1) {
			parsed.error = "URI authority must not contain a literal backslash.";
			malformedAuthorityOrPort = true;
		}
		const introducerMatch = uri.match(AUTHORITY_INTRODUCER_REGION);
		if (introducerMatch !== null) {
			const region = introducerMatch[1];
			const normalizedRegion = region.replace(/[\t\n\r]/g, "");
			if (normalizedRegion.length >= 2) {
				if (normalizedRegion.slice(0, 2) !== "//") {
					parsed.error = parsed.error || "URI authority must not contain a literal backslash.";
					malformedAuthorityOrPort = true;
				} else if (region.length !== normalizedRegion.length) {
					parsed.error = parsed.error || "URI authority introducer must not contain whitespace.";
					malformedAuthorityOrPort = true;
				}
			}
		}
		const matches = uri.match(URI_PARSE);
		if (matches) {
			parsed.scheme = matches[1];
			parsed.userinfo = matches[3];
			parsed.host = matches[4];
			parsed.port = parseInt(matches[5], 10);
			parsed.path = matches[6] || "";
			parsed.query = matches[7];
			parsed.fragment = matches[8];
			if (parsed.scheme !== void 0) {
				if (VALID_SCHEME.test(parsed.scheme)) parsed.scheme = parsed.scheme.toLowerCase();
				else {
					parsed.error = parsed.error || MALFORMED_SCHEME_ERROR;
					malformedScheme = true;
				}
			}
			malformedPercentEncoding = hasMalformedComponentPercentEncoding(matches);
			if (malformedPercentEncoding) parsed.error = parsed.error || "URI contains malformed percent-encoding.";
			if (isNaN(parsed.port)) parsed.port = matches[5];
			const parseError = getParseError(parsed, matches);
			if (parseError !== void 0) {
				parsed.error = parsed.error || parseError;
				malformedAuthorityOrPort = true;
			}
			if (parsed.host) {
				if (isIPv4(parsed.host) === false) {
					const bracketedIPLiteral = isIPLiteral(parsed.host);
					const hasIPLiteralBracket = parsed.host.indexOf("[") !== -1 || parsed.host.indexOf("]") !== -1;
					const ipv6result = normalizeIPv6(parsed.host);
					isIP = ipv6result.isIPV6 || ipv6result.isIPVFuture === true;
					malformedIPLiteral = hasIPLiteralBracket && (!bracketedIPLiteral || ipv6result.error === true);
					parsed.host = isIP ? ipv6result.host : ipv6result.host.toLowerCase();
					if (malformedIPLiteral) {
						parsed.error = parsed.error || MALFORMED_HOST_ERROR;
						malformedAuthorityOrPort = true;
					}
				} else isIP = true;
			}
			if (parsed.scheme === void 0 && parsed.userinfo === void 0 && parsed.host === void 0 && parsed.port === void 0 && parsed.query === void 0 && !parsed.path) parsed.reference = "same-document";
			else if (parsed.scheme === void 0) parsed.reference = "relative";
			else if (parsed.fragment === void 0) parsed.reference = "absolute";
			else parsed.reference = "uri";
			if (options.reference && options.reference !== "suffix" && options.reference !== parsed.reference) parsed.error = parsed.error || "URI is not a " + options.reference + " reference.";
			const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);
			if (!malformedIPLiteral) malformedHost = canonicalizeHost(parsed, options, schemeHandler, isIP);
			if (uri.indexOf("%") !== -1 && parsed.host !== void 0 && !malformedIPLiteral) {
				let host = isIP ? parsed.host : normalizePercentEncoding(parsed.host, true);
				if (!isIP) host = normalizePercentEncoding(host.toLowerCase());
				parsed.host = isIP || options.scheme !== "null" ? reescapeHostDelimiters(host, isIP) : host;
			}
			if (!schemeHandler || schemeHandler && !schemeHandler.skipNormalize) {
				if (parsed.path) parsed.path = normalizePathEncoding(parsed.path);
				if (parsed.query) parsed.query = normalizeQueryFragmentEncoding(parsed.query);
				if (parsed.fragment) parsed.fragment = normalizeQueryFragmentEncoding(parsed.fragment);
			}
			if (schemeHandler && schemeHandler.parse) {
				schemeHandler.parse(parsed, options);
				if (schemeHandler === SCHEMES.urn && parsed.nid === void 0) malformedSchemeSpecific = true;
			}
		} else parsed.error = parsed.error || "URI can not be parsed.";
		return {
			parsed,
			malformedAuthorityOrPort,
			malformedPercentEncoding,
			malformedSchemeSpecific,
			malformedHost,
			malformedScheme
		};
	}
	/**
	* @param {string} uri
	* @param {import('./types/index').Options} [opts]
	* @returns
	*/
	function parse(uri, opts) {
		return parseWithStatus(uri, opts).parsed;
	}
	/**
	* @param {string} uri
	* @param {import('./types/index').Options} [opts]
	* @returns {string}
	*/
	function normalizeString(uri, opts) {
		return normalizeStringWithStatus(uri, opts).normalized;
	}
	/**
	* @param {string} uri
	* @param {import('./types/index').Options} [opts]
	* @returns {{ normalized: string, malformedAuthorityOrPort: boolean, malformedPercentEncoding: boolean, malformedSchemeSpecific: boolean, malformedHost: boolean, malformedScheme: boolean }}
	*/
	function normalizeStringWithStatus(uri, opts) {
		const { parsed, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme } = parseWithStatus(uri, opts);
		return {
			normalized: malformedAuthorityOrPort || malformedPercentEncoding || malformedSchemeSpecific || malformedHost || malformedScheme ? uri : serialize(parsed, opts),
			malformedAuthorityOrPort,
			malformedPercentEncoding,
			malformedSchemeSpecific,
			malformedHost,
			malformedScheme
		};
	}
	/**
	* @param {import ('./types/index').URIComponent|string} uri
	* @param {import('./types/index').Options} [opts]
	* @returns {string|undefined}
	*/
	function normalizeComparableURI(uri, opts) {
		if (typeof uri !== "string" && typeof uri !== "object") return;
		let value;
		try {
			value = typeof uri === "string" ? uri : serialize(uri, opts);
		} catch {
			return;
		}
		const { normalized, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme } = normalizeStringWithStatus(value, opts);
		return malformedAuthorityOrPort || malformedPercentEncoding || malformedSchemeSpecific || malformedHost || malformedScheme ? void 0 : normalized;
	}
	var fastUri = {
		SCHEMES,
		normalize,
		resolve,
		resolveComponent,
		equal,
		serialize,
		parse
	};
	module.exports = fastUri;
	module.exports.default = fastUri;
	module.exports.fastUri = fastUri;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/uri.js
var require_uri = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var uri = require_fast_uri();
	uri.code = "require(\"ajv/dist/runtime/uri\").default";
	exports.default = uri;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/core.js
var require_core$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = void 0;
	var validate_1 = require_validate();
	Object.defineProperty(exports, "KeywordCxt", {
		enumerable: true,
		get: function() {
			return validate_1.KeywordCxt;
		}
	});
	var codegen_1 = require_codegen();
	Object.defineProperty(exports, "_", {
		enumerable: true,
		get: function() {
			return codegen_1._;
		}
	});
	Object.defineProperty(exports, "str", {
		enumerable: true,
		get: function() {
			return codegen_1.str;
		}
	});
	Object.defineProperty(exports, "stringify", {
		enumerable: true,
		get: function() {
			return codegen_1.stringify;
		}
	});
	Object.defineProperty(exports, "nil", {
		enumerable: true,
		get: function() {
			return codegen_1.nil;
		}
	});
	Object.defineProperty(exports, "Name", {
		enumerable: true,
		get: function() {
			return codegen_1.Name;
		}
	});
	Object.defineProperty(exports, "CodeGen", {
		enumerable: true,
		get: function() {
			return codegen_1.CodeGen;
		}
	});
	var validation_error_1 = require_validation_error();
	var ref_error_1 = require_ref_error();
	var rules_1 = require_rules();
	var compile_1 = require_compile();
	var codegen_2 = require_codegen();
	var resolve_1 = require_resolve();
	var dataType_1 = require_dataType();
	var util_1 = require_util();
	var $dataRefSchema = (init_data(), __toCommonJS(data_exports).default);
	var uri_1 = require_uri();
	var defaultRegExp = (str, flags) => new RegExp(str, flags);
	defaultRegExp.code = "new RegExp";
	var META_IGNORE_OPTIONS = [
		"removeAdditional",
		"useDefaults",
		"coerceTypes"
	];
	var EXT_SCOPE_NAMES = /* @__PURE__ */ new Set([
		"validate",
		"serialize",
		"parse",
		"wrapper",
		"root",
		"schema",
		"keyword",
		"pattern",
		"formats",
		"validate$data",
		"func",
		"obj",
		"Error"
	]);
	var removedOptions = {
		errorDataPath: "",
		format: "`validateFormats: false` can be used instead.",
		nullable: "\"nullable\" keyword is supported by default.",
		jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
		extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
		missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
		processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
		sourceCode: "Use option `code: {source: true}`",
		strictDefaults: "It is default now, see option `strict`.",
		strictKeywords: "It is default now, see option `strict`.",
		uniqueItems: "\"uniqueItems\" keyword is always validated.",
		unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
		cache: "Map is used as cache, schema object as key.",
		serialize: "Map is used as cache, schema object as key.",
		ajvErrors: "It is default now."
	};
	var deprecatedOptions = {
		ignoreKeywordsWithRef: "",
		jsPropertySyntax: "",
		unicode: "\"minLength\"/\"maxLength\" account for unicode characters by default."
	};
	var MAX_EXPRESSION = 200;
	function requiredOptions(o) {
		var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
		const s = o.strict;
		const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
		const optimize = _optz === true || _optz === void 0 ? 1 : _optz || 0;
		const regExp = (_c = (_b = o.code) === null || _b === void 0 ? void 0 : _b.regExp) !== null && _c !== void 0 ? _c : defaultRegExp;
		const uriResolver = (_d = o.uriResolver) !== null && _d !== void 0 ? _d : uri_1.default;
		return {
			strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== void 0 ? _e : s) !== null && _f !== void 0 ? _f : true,
			strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== void 0 ? _g : s) !== null && _h !== void 0 ? _h : true,
			strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== void 0 ? _j : s) !== null && _k !== void 0 ? _k : "log",
			strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== void 0 ? _l : s) !== null && _m !== void 0 ? _m : "log",
			strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== void 0 ? _o : s) !== null && _p !== void 0 ? _p : false,
			code: o.code ? {
				...o.code,
				optimize,
				regExp
			} : {
				optimize,
				regExp
			},
			loopRequired: (_q = o.loopRequired) !== null && _q !== void 0 ? _q : MAX_EXPRESSION,
			loopEnum: (_r = o.loopEnum) !== null && _r !== void 0 ? _r : MAX_EXPRESSION,
			meta: (_s = o.meta) !== null && _s !== void 0 ? _s : true,
			messages: (_t = o.messages) !== null && _t !== void 0 ? _t : true,
			inlineRefs: (_u = o.inlineRefs) !== null && _u !== void 0 ? _u : true,
			schemaId: (_v = o.schemaId) !== null && _v !== void 0 ? _v : "$id",
			addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== void 0 ? _w : true,
			validateSchema: (_x = o.validateSchema) !== null && _x !== void 0 ? _x : true,
			validateFormats: (_y = o.validateFormats) !== null && _y !== void 0 ? _y : true,
			unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== void 0 ? _z : true,
			int32range: (_0 = o.int32range) !== null && _0 !== void 0 ? _0 : true,
			uriResolver
		};
	}
	var Ajv = class {
		constructor(opts = {}) {
			this.schemas = {};
			this.refs = {};
			this.formats = Object.create(null);
			this._compilations = /* @__PURE__ */ new Set();
			this._loading = {};
			this._cache = /* @__PURE__ */ new Map();
			opts = this.opts = {
				...opts,
				...requiredOptions(opts)
			};
			const { es5, lines } = this.opts.code;
			this.scope = new codegen_2.ValueScope({
				scope: {},
				prefixes: EXT_SCOPE_NAMES,
				es5,
				lines
			});
			this.logger = getLogger(opts.logger);
			const formatOpt = opts.validateFormats;
			opts.validateFormats = false;
			this.RULES = (0, rules_1.getRules)();
			checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
			checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
			this._metaOpts = getMetaSchemaOptions.call(this);
			if (opts.formats) addInitialFormats.call(this);
			this._addVocabularies();
			this._addDefaultMetaSchema();
			if (opts.keywords) addInitialKeywords.call(this, opts.keywords);
			if (typeof opts.meta == "object") this.addMetaSchema(opts.meta);
			addInitialSchemas.call(this);
			opts.validateFormats = formatOpt;
		}
		_addVocabularies() {
			this.addKeyword("$async");
		}
		_addDefaultMetaSchema() {
			const { $data, meta, schemaId } = this.opts;
			let _dataRefSchema = $dataRefSchema;
			if (schemaId === "id") {
				_dataRefSchema = { ...$dataRefSchema };
				_dataRefSchema.id = _dataRefSchema.$id;
				delete _dataRefSchema.$id;
			}
			if (meta && $data) this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
		}
		defaultMeta() {
			const { meta, schemaId } = this.opts;
			return this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : void 0;
		}
		validate(schemaKeyRef, data) {
			let v;
			if (typeof schemaKeyRef == "string") {
				v = this.getSchema(schemaKeyRef);
				if (!v) throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
			} else v = this.compile(schemaKeyRef);
			const valid = v(data);
			if (!("$async" in v)) this.errors = v.errors;
			return valid;
		}
		compile(schema, _meta) {
			const sch = this._addSchema(schema, _meta);
			return sch.validate || this._compileSchemaEnv(sch);
		}
		compileAsync(schema, meta) {
			if (typeof this.opts.loadSchema != "function") throw new Error("options.loadSchema should be a function");
			const { loadSchema } = this.opts;
			return runCompileAsync.call(this, schema, meta);
			async function runCompileAsync(_schema, _meta) {
				await loadMetaSchema.call(this, _schema.$schema);
				const sch = this._addSchema(_schema, _meta);
				return sch.validate || _compileAsync.call(this, sch);
			}
			async function loadMetaSchema($ref) {
				if ($ref && !this.getSchema($ref)) await runCompileAsync.call(this, { $ref }, true);
			}
			async function _compileAsync(sch) {
				try {
					return this._compileSchemaEnv(sch);
				} catch (e) {
					if (!(e instanceof ref_error_1.default)) throw e;
					checkLoaded.call(this, e);
					await loadMissingSchema.call(this, e.missingSchema);
					return _compileAsync.call(this, sch);
				}
			}
			function checkLoaded({ missingSchema: ref, missingRef }) {
				if (this.refs[ref]) throw new Error(`AnySchema ${ref} is loaded but ${missingRef} cannot be resolved`);
			}
			async function loadMissingSchema(ref) {
				const _schema = await _loadSchema.call(this, ref);
				if (!this.refs[ref]) await loadMetaSchema.call(this, _schema.$schema);
				if (!this.refs[ref]) this.addSchema(_schema, ref, meta);
			}
			async function _loadSchema(ref) {
				const p = this._loading[ref];
				if (p) return p;
				try {
					return await (this._loading[ref] = loadSchema(ref));
				} finally {
					delete this._loading[ref];
				}
			}
		}
		addSchema(schema, key, _meta, _validateSchema = this.opts.validateSchema) {
			if (Array.isArray(schema)) {
				for (const sch of schema) this.addSchema(sch, void 0, _meta, _validateSchema);
				return this;
			}
			let id;
			if (typeof schema === "object") {
				const { schemaId } = this.opts;
				id = schema[schemaId];
				if (id !== void 0 && typeof id != "string") throw new Error(`schema ${schemaId} must be string`);
			}
			key = (0, resolve_1.normalizeId)(key || id);
			this._checkUnique(key);
			this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
			return this;
		}
		addMetaSchema(schema, key, _validateSchema = this.opts.validateSchema) {
			this.addSchema(schema, key, true, _validateSchema);
			return this;
		}
		validateSchema(schema, throwOrLogError) {
			if (typeof schema == "boolean") return true;
			let $schema;
			$schema = schema.$schema;
			if ($schema !== void 0 && typeof $schema != "string") throw new Error("$schema must be a string");
			$schema = $schema || this.opts.defaultMeta || this.defaultMeta();
			if (!$schema) {
				this.logger.warn("meta-schema not available");
				this.errors = null;
				return true;
			}
			const valid = this.validate($schema, schema);
			if (!valid && throwOrLogError) {
				const message = "schema is invalid: " + this.errorsText();
				if (this.opts.validateSchema === "log") this.logger.error(message);
				else throw new Error(message);
			}
			return valid;
		}
		getSchema(keyRef) {
			let sch;
			while (typeof (sch = getSchEnv.call(this, keyRef)) == "string") keyRef = sch;
			if (sch === void 0) {
				const { schemaId } = this.opts;
				const root = new compile_1.SchemaEnv({
					schema: {},
					schemaId
				});
				sch = compile_1.resolveSchema.call(this, root, keyRef);
				if (!sch) return;
				this.refs[keyRef] = sch;
			}
			return sch.validate || this._compileSchemaEnv(sch);
		}
		removeSchema(schemaKeyRef) {
			if (schemaKeyRef instanceof RegExp) {
				this._removeAllSchemas(this.schemas, schemaKeyRef);
				this._removeAllSchemas(this.refs, schemaKeyRef);
				return this;
			}
			switch (typeof schemaKeyRef) {
				case "undefined":
					this._removeAllSchemas(this.schemas);
					this._removeAllSchemas(this.refs);
					this._cache.clear();
					return this;
				case "string": {
					const sch = getSchEnv.call(this, schemaKeyRef);
					if (typeof sch == "object") this._cache.delete(sch.schema);
					delete this.schemas[schemaKeyRef];
					delete this.refs[schemaKeyRef];
					return this;
				}
				case "object": {
					const cacheKey = schemaKeyRef;
					this._cache.delete(cacheKey);
					let id = schemaKeyRef[this.opts.schemaId];
					if (id) {
						id = (0, resolve_1.normalizeId)(id);
						delete this.schemas[id];
						delete this.refs[id];
					}
					return this;
				}
				default: throw new Error("ajv.removeSchema: invalid parameter");
			}
		}
		addVocabulary(definitions) {
			for (const def of definitions) this.addKeyword(def);
			return this;
		}
		addKeyword(kwdOrDef, def) {
			let keyword;
			if (typeof kwdOrDef == "string") {
				keyword = kwdOrDef;
				if (typeof def == "object") {
					this.logger.warn("these parameters are deprecated, see docs for addKeyword");
					def.keyword = keyword;
				}
			} else if (typeof kwdOrDef == "object" && def === void 0) {
				def = kwdOrDef;
				keyword = def.keyword;
				if (Array.isArray(keyword) && !keyword.length) throw new Error("addKeywords: keyword must be string or non-empty array");
			} else throw new Error("invalid addKeywords parameters");
			checkKeyword.call(this, keyword, def);
			if (!def) {
				(0, util_1.eachItem)(keyword, (kwd) => addRule.call(this, kwd));
				return this;
			}
			keywordMetaschema.call(this, def);
			const definition = {
				...def,
				type: (0, dataType_1.getJSONTypes)(def.type),
				schemaType: (0, dataType_1.getJSONTypes)(def.schemaType)
			};
			(0, util_1.eachItem)(keyword, definition.type.length === 0 ? (k) => addRule.call(this, k, definition) : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
			return this;
		}
		getKeyword(keyword) {
			const rule = this.RULES.all[keyword];
			return typeof rule == "object" ? rule.definition : !!rule;
		}
		removeKeyword(keyword) {
			const { RULES } = this;
			delete RULES.keywords[keyword];
			delete RULES.all[keyword];
			for (const group of RULES.rules) {
				const i = group.rules.findIndex((rule) => rule.keyword === keyword);
				if (i >= 0) group.rules.splice(i, 1);
			}
			return this;
		}
		addFormat(name, format) {
			if (typeof format == "string") format = new RegExp(format);
			this.formats[name] = format;
			return this;
		}
		errorsText(errors = this.errors, { separator = ", ", dataVar = "data" } = {}) {
			if (!errors || errors.length === 0) return "No errors";
			return errors.map((e) => `${dataVar}${e.instancePath} ${e.message}`).reduce((text, msg) => text + separator + msg);
		}
		$dataMetaSchema(metaSchema, keywordsJsonPointers) {
			const rules = this.RULES.all;
			metaSchema = JSON.parse(JSON.stringify(metaSchema));
			for (const jsonPointer of keywordsJsonPointers) {
				const segments = jsonPointer.split("/").slice(1);
				let keywords = metaSchema;
				for (const seg of segments) keywords = keywords[seg];
				for (const key in rules) {
					const rule = rules[key];
					if (typeof rule != "object") continue;
					const { $data } = rule.definition;
					const schema = keywords[key];
					if ($data && schema) keywords[key] = schemaOrData(schema);
				}
			}
			return metaSchema;
		}
		_removeAllSchemas(schemas, regex) {
			for (const keyRef in schemas) {
				const sch = schemas[keyRef];
				if (!regex || regex.test(keyRef)) {
					if (typeof sch == "string") delete schemas[keyRef];
					else if (sch && !sch.meta) {
						this._cache.delete(sch.schema);
						delete schemas[keyRef];
					}
				}
			}
		}
		_addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
			let id;
			const { schemaId } = this.opts;
			if (typeof schema == "object") id = schema[schemaId];
			else if (this.opts.jtd) throw new Error("schema must be object");
			else if (typeof schema != "boolean") throw new Error("schema must be object or boolean");
			let sch = this._cache.get(schema);
			if (sch !== void 0) return sch;
			baseId = (0, resolve_1.normalizeId)(id || baseId);
			const localRefs = resolve_1.getSchemaRefs.call(this, schema, baseId);
			sch = new compile_1.SchemaEnv({
				schema,
				schemaId,
				meta,
				baseId,
				localRefs
			});
			this._cache.set(sch.schema, sch);
			if (addSchema && !baseId.startsWith("#")) {
				if (baseId) this._checkUnique(baseId);
				this.refs[baseId] = sch;
			}
			if (validateSchema) this.validateSchema(schema, true);
			return sch;
		}
		_checkUnique(id) {
			if (this.schemas[id] || this.refs[id]) throw new Error(`schema with key or id "${id}" already exists`);
		}
		_compileSchemaEnv(sch) {
			if (sch.meta) this._compileMetaSchema(sch);
			else compile_1.compileSchema.call(this, sch);
			/* istanbul ignore if */
			if (!sch.validate) throw new Error("ajv implementation error");
			return sch.validate;
		}
		_compileMetaSchema(sch) {
			const currentOpts = this.opts;
			this.opts = this._metaOpts;
			try {
				compile_1.compileSchema.call(this, sch);
			} finally {
				this.opts = currentOpts;
			}
		}
	};
	Ajv.ValidationError = validation_error_1.default;
	Ajv.MissingRefError = ref_error_1.default;
	exports.default = Ajv;
	function checkOptions(checkOpts, options, msg, log = "error") {
		for (const key in checkOpts) {
			const opt = key;
			if (opt in options) this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
		}
	}
	function getSchEnv(keyRef) {
		keyRef = (0, resolve_1.normalizeId)(keyRef);
		return this.schemas[keyRef] || this.refs[keyRef];
	}
	function addInitialSchemas() {
		const optsSchemas = this.opts.schemas;
		if (!optsSchemas) return;
		if (Array.isArray(optsSchemas)) this.addSchema(optsSchemas);
		else for (const key in optsSchemas) this.addSchema(optsSchemas[key], key);
	}
	function addInitialFormats() {
		for (const name in this.opts.formats) {
			const format = this.opts.formats[name];
			if (format) this.addFormat(name, format);
		}
	}
	function addInitialKeywords(defs) {
		if (Array.isArray(defs)) {
			this.addVocabulary(defs);
			return;
		}
		this.logger.warn("keywords option as map is deprecated, pass array");
		for (const keyword in defs) {
			const def = defs[keyword];
			if (!def.keyword) def.keyword = keyword;
			this.addKeyword(def);
		}
	}
	function getMetaSchemaOptions() {
		const metaOpts = { ...this.opts };
		for (const opt of META_IGNORE_OPTIONS) delete metaOpts[opt];
		return metaOpts;
	}
	var noLogs = {
		log() {},
		warn() {},
		error() {}
	};
	function getLogger(logger) {
		if (logger === false) return noLogs;
		if (logger === void 0) return console;
		if (logger.log && logger.warn && logger.error) return logger;
		throw new Error("logger must implement log, warn and error methods");
	}
	var KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
	function checkKeyword(keyword, def) {
		const { RULES } = this;
		(0, util_1.eachItem)(keyword, (kwd) => {
			if (RULES.keywords[kwd]) throw new Error(`Keyword ${kwd} is already defined`);
			if (!KEYWORD_NAME.test(kwd)) throw new Error(`Keyword ${kwd} has invalid name`);
		});
		if (!def) return;
		if (def.$data && !("code" in def || "validate" in def)) throw new Error("$data keyword must have \"code\" or \"validate\" function");
	}
	function addRule(keyword, definition, dataType) {
		var _a;
		const post = definition === null || definition === void 0 ? void 0 : definition.post;
		if (dataType && post) throw new Error("keyword with \"post\" flag cannot have \"type\"");
		const { RULES } = this;
		let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType);
		if (!ruleGroup) {
			ruleGroup = {
				type: dataType,
				rules: []
			};
			RULES.rules.push(ruleGroup);
		}
		RULES.keywords[keyword] = true;
		if (!definition) return;
		const rule = {
			keyword,
			definition: {
				...definition,
				type: (0, dataType_1.getJSONTypes)(definition.type),
				schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType)
			}
		};
		if (definition.before) addBeforeRule.call(this, ruleGroup, rule, definition.before);
		else ruleGroup.rules.push(rule);
		RULES.all[keyword] = rule;
		(_a = definition.implements) === null || _a === void 0 || _a.forEach((kwd) => this.addKeyword(kwd));
	}
	function addBeforeRule(ruleGroup, rule, before) {
		const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
		if (i >= 0) ruleGroup.rules.splice(i, 0, rule);
		else {
			ruleGroup.rules.push(rule);
			this.logger.warn(`rule ${before} is not defined`);
		}
	}
	function keywordMetaschema(def) {
		let { metaSchema } = def;
		if (metaSchema === void 0) return;
		if (def.$data && this.opts.$data) metaSchema = schemaOrData(metaSchema);
		def.validateSchema = this.compile(metaSchema, true);
	}
	var $dataRef = { $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#" };
	function schemaOrData(schema) {
		return { anyOf: [schema, $dataRef] };
	}
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/core/id.js
var require_id = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.default = {
		keyword: "id",
		code() {
			throw new Error("NOT SUPPORTED: keyword \"id\", use \"$id\" for schema ID");
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/core/ref.js
var require_ref = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.callRef = exports.getValidate = void 0;
	var ref_error_1 = require_ref_error();
	var code_1 = require_code();
	var codegen_1 = require_codegen();
	var names_1 = require_names();
	var compile_1 = require_compile();
	var util_1 = require_util();
	var def = {
		keyword: "$ref",
		schemaType: "string",
		code(cxt) {
			const { gen, schema: $ref, it } = cxt;
			const { baseId, schemaEnv: env, validateName, opts, self } = it;
			const { root } = env;
			if (($ref === "#" || $ref === "#/") && baseId === root.baseId) return callRootRef();
			const schOrEnv = compile_1.resolveRef.call(self, root, baseId, $ref);
			if (schOrEnv === void 0) throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
			if (schOrEnv instanceof compile_1.SchemaEnv) return callValidate(schOrEnv);
			return inlineRefSchema(schOrEnv);
			function callRootRef() {
				if (env === root) return callRef(cxt, validateName, env, env.$async);
				const rootName = gen.scopeValue("root", { ref: root });
				return callRef(cxt, (0, codegen_1._)`${rootName}.validate`, root, root.$async);
			}
			function callValidate(sch) {
				callRef(cxt, getValidate(cxt, sch), sch, sch.$async);
			}
			function inlineRefSchema(sch) {
				const schName = gen.scopeValue("schema", opts.code.source === true ? {
					ref: sch,
					code: (0, codegen_1.stringify)(sch)
				} : { ref: sch });
				const valid = gen.name("valid");
				const schCxt = cxt.subschema({
					schema: sch,
					dataTypes: [],
					schemaPath: codegen_1.nil,
					topSchemaRef: schName,
					errSchemaPath: $ref
				}, valid);
				cxt.mergeEvaluated(schCxt);
				cxt.ok(valid);
			}
		}
	};
	function getValidate(cxt, sch) {
		const { gen } = cxt;
		return sch.validate ? gen.scopeValue("validate", { ref: sch.validate }) : (0, codegen_1._)`${gen.scopeValue("wrapper", { ref: sch })}.validate`;
	}
	exports.getValidate = getValidate;
	function callRef(cxt, v, sch, $async) {
		const { gen, it } = cxt;
		const { allErrors, schemaEnv: env, opts } = it;
		const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
		if ($async) callAsyncRef();
		else callSyncRef();
		function callAsyncRef() {
			if (!env.$async) throw new Error("async schema referenced by sync schema");
			const valid = gen.let("valid");
			gen.try(() => {
				gen.code((0, codegen_1._)`await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
				addEvaluatedFrom(v);
				if (!allErrors) gen.assign(valid, true);
			}, (e) => {
				gen.if((0, codegen_1._)`!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
				addErrorsFrom(e);
				if (!allErrors) gen.assign(valid, false);
			});
			cxt.ok(valid);
		}
		function callSyncRef() {
			cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
		}
		function addErrorsFrom(source) {
			const errs = (0, codegen_1._)`${source}.errors`;
			gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`);
			gen.assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
		}
		function addEvaluatedFrom(source) {
			var _a;
			if (!it.opts.unevaluated) return;
			const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
			if (it.props !== true) {
				if (schEvaluated && !schEvaluated.dynamicProps) {
					if (schEvaluated.props !== void 0) it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
				} else {
					const props = gen.var("props", (0, codegen_1._)`${source}.evaluated.props`);
					it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
				}
			}
			if (it.items !== true) {
				if (schEvaluated && !schEvaluated.dynamicItems) {
					if (schEvaluated.items !== void 0) it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
				} else {
					const items = gen.var("items", (0, codegen_1._)`${source}.evaluated.items`);
					it.items = util_1.mergeEvaluated.items(gen, items, it.items, codegen_1.Name);
				}
			}
		}
	}
	exports.callRef = callRef;
	exports.default = def;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/core/index.js
var require_core = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var id_1 = require_id();
	var ref_1 = require_ref();
	exports.default = [
		"$schema",
		"$id",
		"$defs",
		"$vocabulary",
		{ keyword: "$comment" },
		"definitions",
		id_1.default,
		ref_1.default
	];
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/limitNumber.js
var require_limitNumber = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var codegen_1 = require_codegen();
	var ops = codegen_1.operators;
	var KWDs = {
		maximum: {
			okStr: "<=",
			ok: ops.LTE,
			fail: ops.GT
		},
		minimum: {
			okStr: ">=",
			ok: ops.GTE,
			fail: ops.LT
		},
		exclusiveMaximum: {
			okStr: "<",
			ok: ops.LT,
			fail: ops.GTE
		},
		exclusiveMinimum: {
			okStr: ">",
			ok: ops.GT,
			fail: ops.LTE
		}
	};
	exports.default = {
		keyword: Object.keys(KWDs),
		type: "number",
		schemaType: "number",
		$data: true,
		error: {
			message: ({ keyword, schemaCode }) => (0, codegen_1.str)`must be ${KWDs[keyword].okStr} ${schemaCode}`,
			params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
		},
		code(cxt) {
			const { keyword, data, schemaCode } = cxt;
			cxt.fail$data((0, codegen_1._)`${data} ${KWDs[keyword].fail} ${schemaCode} || isNaN(${data})`);
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/multipleOf.js
var require_multipleOf = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var codegen_1 = require_codegen();
	exports.default = {
		keyword: "multipleOf",
		type: "number",
		schemaType: "number",
		$data: true,
		error: {
			message: ({ schemaCode }) => (0, codegen_1.str)`must be multiple of ${schemaCode}`,
			params: ({ schemaCode }) => (0, codegen_1._)`{multipleOf: ${schemaCode}}`
		},
		code(cxt) {
			const { gen, data, schemaCode, it } = cxt;
			const prec = it.opts.multipleOfPrecision;
			const res = gen.let("res");
			const invalid = prec ? (0, codegen_1._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1._)`${res} !== parseInt(${res})`;
			cxt.fail$data((0, codegen_1._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	function ucs2length(str) {
		const len = str.length;
		let length = 0;
		let pos = 0;
		let value;
		while (pos < len) {
			length++;
			value = str.charCodeAt(pos++);
			if (value >= 55296 && value <= 56319 && pos < len) {
				value = str.charCodeAt(pos);
				if ((value & 64512) === 56320) pos++;
			}
		}
		return length;
	}
	exports.default = ucs2length;
	ucs2length.code = "require(\"ajv/dist/runtime/ucs2length\").default";
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/limitLength.js
var require_limitLength = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	var ucs2length_1 = require_ucs2length();
	exports.default = {
		keyword: ["maxLength", "minLength"],
		type: "string",
		schemaType: "number",
		$data: true,
		error: {
			message({ keyword, schemaCode }) {
				const comp = keyword === "maxLength" ? "more" : "fewer";
				return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} characters`;
			},
			params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
		},
		code(cxt) {
			const { keyword, data, schemaCode, it } = cxt;
			const op = keyword === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
			const len = it.opts.unicode === false ? (0, codegen_1._)`${data}.length` : (0, codegen_1._)`${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
			cxt.fail$data((0, codegen_1._)`${len} ${op} ${schemaCode}`);
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/pattern.js
var require_pattern = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var code_1 = require_code();
	var util_1 = require_util();
	var codegen_1 = require_codegen();
	exports.default = {
		keyword: "pattern",
		type: "string",
		schemaType: "string",
		$data: true,
		error: {
			message: ({ schemaCode }) => (0, codegen_1.str)`must match pattern "${schemaCode}"`,
			params: ({ schemaCode }) => (0, codegen_1._)`{pattern: ${schemaCode}}`
		},
		code(cxt) {
			const { gen, data, $data, schema, schemaCode, it } = cxt;
			const u = it.opts.unicodeRegExp ? "u" : "";
			if ($data) {
				const { regExp } = it.opts.code;
				const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1._)`new RegExp` : (0, util_1.useFunc)(gen, regExp);
				const valid = gen.let("valid");
				gen.try(() => gen.assign(valid, (0, codegen_1._)`${regExpCode}(${schemaCode}, ${u}).test(${data})`), () => gen.assign(valid, false));
				cxt.fail$data((0, codegen_1._)`!${valid}`);
			} else {
				const regExp = (0, code_1.usePattern)(cxt, schema);
				cxt.fail$data((0, codegen_1._)`!${regExp}.test(${data})`);
			}
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/limitProperties.js
var require_limitProperties = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var codegen_1 = require_codegen();
	exports.default = {
		keyword: ["maxProperties", "minProperties"],
		type: "object",
		schemaType: "number",
		$data: true,
		error: {
			message({ keyword, schemaCode }) {
				const comp = keyword === "maxProperties" ? "more" : "fewer";
				return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} properties`;
			},
			params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
		},
		code(cxt) {
			const { keyword, data, schemaCode } = cxt;
			const op = keyword === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
			cxt.fail$data((0, codegen_1._)`Object.keys(${data}).length ${op} ${schemaCode}`);
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/required.js
var require_required = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var code_1 = require_code();
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	exports.default = {
		keyword: "required",
		type: "object",
		schemaType: "array",
		$data: true,
		error: {
			message: ({ params: { missingProperty } }) => (0, codegen_1.str)`must have required property '${missingProperty}'`,
			params: ({ params: { missingProperty } }) => (0, codegen_1._)`{missingProperty: ${missingProperty}}`
		},
		code(cxt) {
			const { gen, schema, schemaCode, data, $data, it } = cxt;
			const { opts } = it;
			if (!$data && schema.length === 0) return;
			const useLoop = schema.length >= opts.loopRequired;
			if (it.allErrors) allErrorsMode();
			else exitOnErrorMode();
			if (opts.strictRequired) {
				const props = cxt.parentSchema.properties;
				const { definedProperties } = cxt.it;
				for (const requiredKey of schema) if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === void 0 && !definedProperties.has(requiredKey)) {
					const msg = `required property "${requiredKey}" is not defined at "${it.schemaEnv.baseId + it.errSchemaPath}" (strictRequired)`;
					(0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
				}
			}
			function allErrorsMode() {
				if (useLoop || $data) cxt.block$data(codegen_1.nil, loopAllRequired);
				else for (const prop of schema) (0, code_1.checkReportMissingProp)(cxt, prop);
			}
			function exitOnErrorMode() {
				const missing = gen.let("missing");
				if (useLoop || $data) {
					const valid = gen.let("valid", true);
					cxt.block$data(valid, () => loopUntilMissing(missing, valid));
					cxt.ok(valid);
				} else {
					gen.if((0, code_1.checkMissingProp)(cxt, schema, missing));
					(0, code_1.reportMissingProp)(cxt, missing);
					gen.else();
				}
			}
			function loopAllRequired() {
				gen.forOf("prop", schemaCode, (prop) => {
					cxt.setParams({ missingProperty: prop });
					gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
				});
			}
			function loopUntilMissing(missing, valid) {
				cxt.setParams({ missingProperty: missing });
				gen.forOf(missing, schemaCode, () => {
					gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
					gen.if((0, codegen_1.not)(valid), () => {
						cxt.error();
						gen.break();
					});
				}, codegen_1.nil);
			}
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/limitItems.js
var require_limitItems = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var codegen_1 = require_codegen();
	exports.default = {
		keyword: ["maxItems", "minItems"],
		type: "array",
		schemaType: "number",
		$data: true,
		error: {
			message({ keyword, schemaCode }) {
				const comp = keyword === "maxItems" ? "more" : "fewer";
				return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} items`;
			},
			params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
		},
		code(cxt) {
			const { keyword, data, schemaCode } = cxt;
			const op = keyword === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
			cxt.fail$data((0, codegen_1._)`${data}.length ${op} ${schemaCode}`);
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/equal.js
var require_equal = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var equal = require_fast_deep_equal();
	equal.code = "require(\"ajv/dist/runtime/equal\").default";
	exports.default = equal;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/uniqueItems.js
var require_uniqueItems = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var dataType_1 = require_dataType();
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	var equal_1 = require_equal();
	exports.default = {
		keyword: "uniqueItems",
		type: "array",
		schemaType: "boolean",
		$data: true,
		error: {
			message: ({ params: { i, j } }) => (0, codegen_1.str)`must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
			params: ({ params: { i, j } }) => (0, codegen_1._)`{i: ${i}, j: ${j}}`
		},
		code(cxt) {
			const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
			if (!$data && !schema) return;
			const valid = gen.let("valid");
			const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
			cxt.block$data(valid, validateUniqueItems, (0, codegen_1._)`${schemaCode} === false`);
			cxt.ok(valid);
			function validateUniqueItems() {
				const i = gen.let("i", (0, codegen_1._)`${data}.length`);
				const j = gen.let("j");
				cxt.setParams({
					i,
					j
				});
				gen.assign(valid, true);
				gen.if((0, codegen_1._)`${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
			}
			function canOptimize() {
				return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
			}
			function loopN(i, j) {
				const item = gen.name("item");
				const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
				const indices = gen.const("indices", (0, codegen_1._)`{}`);
				gen.for((0, codegen_1._)`;${i}--;`, () => {
					gen.let(item, (0, codegen_1._)`${data}[${i}]`);
					gen.if(wrongType, (0, codegen_1._)`continue`);
					if (itemTypes.length > 1) gen.if((0, codegen_1._)`typeof ${item} == "string"`, (0, codegen_1._)`${item} += "_"`);
					gen.if((0, codegen_1._)`typeof ${indices}[${item}] == "number"`, () => {
						gen.assign(j, (0, codegen_1._)`${indices}[${item}]`);
						cxt.error();
						gen.assign(valid, false).break();
					}).code((0, codegen_1._)`${indices}[${item}] = ${i}`);
				});
			}
			function loopN2(i, j) {
				const eql = (0, util_1.useFunc)(gen, equal_1.default);
				const outer = gen.name("outer");
				gen.label(outer).for((0, codegen_1._)`;${i}--;`, () => gen.for((0, codegen_1._)`${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._)`${eql}(${data}[${i}], ${data}[${j}])`, () => {
					cxt.error();
					gen.assign(valid, false).break(outer);
				})));
			}
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/const.js
var require_const = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	var equal_1 = require_equal();
	exports.default = {
		keyword: "const",
		$data: true,
		error: {
			message: "must be equal to constant",
			params: ({ schemaCode }) => (0, codegen_1._)`{allowedValue: ${schemaCode}}`
		},
		code(cxt) {
			const { gen, data, $data, schemaCode, schema } = cxt;
			if ($data || schema && typeof schema == "object") cxt.fail$data((0, codegen_1._)`!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
			else cxt.fail((0, codegen_1._)`${schema} !== ${data}`);
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/enum.js
var require_enum = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	var equal_1 = require_equal();
	exports.default = {
		keyword: "enum",
		schemaType: "array",
		$data: true,
		error: {
			message: "must be equal to one of the allowed values",
			params: ({ schemaCode }) => (0, codegen_1._)`{allowedValues: ${schemaCode}}`
		},
		code(cxt) {
			const { gen, data, $data, schema, schemaCode, it } = cxt;
			if (!$data && schema.length === 0) throw new Error("enum must have non-empty array");
			const useLoop = schema.length >= it.opts.loopEnum;
			let eql;
			const getEql = () => eql !== null && eql !== void 0 ? eql : eql = (0, util_1.useFunc)(gen, equal_1.default);
			let valid;
			if (useLoop || $data) {
				valid = gen.let("valid");
				cxt.block$data(valid, loopEnum);
			} else {
				/* istanbul ignore if */
				if (!Array.isArray(schema)) throw new Error("ajv implementation error");
				const vSchema = gen.const("vSchema", schemaCode);
				valid = (0, codegen_1.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
			}
			cxt.pass(valid);
			function loopEnum() {
				gen.assign(valid, false);
				gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
			}
			function equalCode(vSchema, i) {
				const sch = schema[i];
				return typeof sch === "object" && sch !== null ? (0, codegen_1._)`${getEql()}(${data}, ${vSchema}[${i}])` : (0, codegen_1._)`${data} === ${sch}`;
			}
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/index.js
var require_validation = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var limitNumber_1 = require_limitNumber();
	var multipleOf_1 = require_multipleOf();
	var limitLength_1 = require_limitLength();
	var pattern_1 = require_pattern();
	var limitProperties_1 = require_limitProperties();
	var required_1 = require_required();
	var limitItems_1 = require_limitItems();
	var uniqueItems_1 = require_uniqueItems();
	var const_1 = require_const();
	var enum_1 = require_enum();
	exports.default = [
		limitNumber_1.default,
		multipleOf_1.default,
		limitLength_1.default,
		pattern_1.default,
		limitProperties_1.default,
		required_1.default,
		limitItems_1.default,
		uniqueItems_1.default,
		{
			keyword: "type",
			schemaType: ["string", "array"]
		},
		{
			keyword: "nullable",
			schemaType: "boolean"
		},
		const_1.default,
		enum_1.default
	];
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/additionalItems.js
var require_additionalItems = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.validateAdditionalItems = void 0;
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	var def = {
		keyword: "additionalItems",
		type: "array",
		schemaType: ["boolean", "object"],
		before: "uniqueItems",
		error: {
			message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
			params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
		},
		code(cxt) {
			const { parentSchema, it } = cxt;
			const { items } = parentSchema;
			if (!Array.isArray(items)) {
				(0, util_1.checkStrictMode)(it, "\"additionalItems\" is ignored when \"items\" is not an array of schemas");
				return;
			}
			validateAdditionalItems(cxt, items);
		}
	};
	function validateAdditionalItems(cxt, items) {
		const { gen, schema, data, keyword, it } = cxt;
		it.items = true;
		const len = gen.const("len", (0, codegen_1._)`${data}.length`);
		if (schema === false) {
			cxt.setParams({ len: items.length });
			cxt.pass((0, codegen_1._)`${len} <= ${items.length}`);
		} else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
			const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items.length}`);
			gen.if((0, codegen_1.not)(valid), () => validateItems(valid));
			cxt.ok(valid);
		}
		function validateItems(valid) {
			gen.forRange("i", items.length, len, (i) => {
				cxt.subschema({
					keyword,
					dataProp: i,
					dataPropType: util_1.Type.Num
				}, valid);
				if (!it.allErrors) gen.if((0, codegen_1.not)(valid), () => gen.break());
			});
		}
	}
	exports.validateAdditionalItems = validateAdditionalItems;
	exports.default = def;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/items.js
var require_items = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.validateTuple = void 0;
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	var code_1 = require_code();
	var def = {
		keyword: "items",
		type: "array",
		schemaType: [
			"object",
			"array",
			"boolean"
		],
		before: "uniqueItems",
		code(cxt) {
			const { schema, it } = cxt;
			if (Array.isArray(schema)) return validateTuple(cxt, "additionalItems", schema);
			it.items = true;
			if ((0, util_1.alwaysValidSchema)(it, schema)) return;
			cxt.ok((0, code_1.validateArray)(cxt));
		}
	};
	function validateTuple(cxt, extraItems, schArr = cxt.schema) {
		const { gen, parentSchema, data, keyword, it } = cxt;
		checkStrictTuple(parentSchema);
		if (it.opts.unevaluated && schArr.length && it.items !== true) it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
		const valid = gen.name("valid");
		const len = gen.const("len", (0, codegen_1._)`${data}.length`);
		schArr.forEach((sch, i) => {
			if ((0, util_1.alwaysValidSchema)(it, sch)) return;
			gen.if((0, codegen_1._)`${len} > ${i}`, () => cxt.subschema({
				keyword,
				schemaProp: i,
				dataProp: i
			}, valid));
			cxt.ok(valid);
		});
		function checkStrictTuple(sch) {
			const { opts, errSchemaPath } = it;
			const l = schArr.length;
			const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
			if (opts.strictTuples && !fullTuple) {
				const msg = `"${keyword}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
				(0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
			}
		}
	}
	exports.validateTuple = validateTuple;
	exports.default = def;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/prefixItems.js
var require_prefixItems = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var items_1 = require_items();
	exports.default = {
		keyword: "prefixItems",
		type: "array",
		schemaType: ["array"],
		before: "uniqueItems",
		code: (cxt) => (0, items_1.validateTuple)(cxt, "items")
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/items2020.js
var require_items2020 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	var code_1 = require_code();
	var additionalItems_1 = require_additionalItems();
	exports.default = {
		keyword: "items",
		type: "array",
		schemaType: ["object", "boolean"],
		before: "uniqueItems",
		error: {
			message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
			params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
		},
		code(cxt) {
			const { schema, parentSchema, it } = cxt;
			const { prefixItems } = parentSchema;
			it.items = true;
			if ((0, util_1.alwaysValidSchema)(it, schema)) return;
			if (prefixItems) (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems);
			else cxt.ok((0, code_1.validateArray)(cxt));
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/contains.js
var require_contains = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	exports.default = {
		keyword: "contains",
		type: "array",
		schemaType: ["object", "boolean"],
		before: "uniqueItems",
		trackErrors: true,
		error: {
			message: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1.str)`must contain at least ${min} valid item(s)` : (0, codegen_1.str)`must contain at least ${min} and no more than ${max} valid item(s)`,
			params: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1._)`{minContains: ${min}}` : (0, codegen_1._)`{minContains: ${min}, maxContains: ${max}}`
		},
		code(cxt) {
			const { gen, schema, parentSchema, data, it } = cxt;
			let min;
			let max;
			const { minContains, maxContains } = parentSchema;
			if (it.opts.next) {
				min = minContains === void 0 ? 1 : minContains;
				max = maxContains;
			} else min = 1;
			const len = gen.const("len", (0, codegen_1._)`${data}.length`);
			cxt.setParams({
				min,
				max
			});
			if (max === void 0 && min === 0) {
				(0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
				return;
			}
			if (max !== void 0 && min > max) {
				(0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
				cxt.fail();
				return;
			}
			if ((0, util_1.alwaysValidSchema)(it, schema)) {
				let cond = (0, codegen_1._)`${len} >= ${min}`;
				if (max !== void 0) cond = (0, codegen_1._)`${cond} && ${len} <= ${max}`;
				cxt.pass(cond);
				return;
			}
			it.items = true;
			const valid = gen.name("valid");
			if (max === void 0 && min === 1) validateItems(valid, () => gen.if(valid, () => gen.break()));
			else if (min === 0) {
				gen.let(valid, true);
				if (max !== void 0) gen.if((0, codegen_1._)`${data}.length > 0`, validateItemsWithCount);
			} else {
				gen.let(valid, false);
				validateItemsWithCount();
			}
			cxt.result(valid, () => cxt.reset());
			function validateItemsWithCount() {
				const schValid = gen.name("_valid");
				const count = gen.let("count", 0);
				validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
			}
			function validateItems(_valid, block) {
				gen.forRange("i", 0, len, (i) => {
					cxt.subschema({
						keyword: "contains",
						dataProp: i,
						dataPropType: util_1.Type.Num,
						compositeRule: true
					}, _valid);
					block();
				});
			}
			function checkLimits(count) {
				gen.code((0, codegen_1._)`${count}++`);
				if (max === void 0) gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true).break());
				else {
					gen.if((0, codegen_1._)`${count} > ${max}`, () => gen.assign(valid, false).break());
					if (min === 1) gen.assign(valid, true);
					else gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true));
				}
			}
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/dependencies.js
var require_dependencies = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.validateSchemaDeps = exports.validatePropertyDeps = exports.error = void 0;
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	var code_1 = require_code();
	exports.error = {
		message: ({ params: { property, depsCount, deps } }) => {
			const property_ies = depsCount === 1 ? "property" : "properties";
			return (0, codegen_1.str)`must have ${property_ies} ${deps} when property ${property} is present`;
		},
		params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._)`{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`
	};
	var def = {
		keyword: "dependencies",
		type: "object",
		schemaType: "object",
		error: exports.error,
		code(cxt) {
			const [propDeps, schDeps] = splitDependencies(cxt);
			validatePropertyDeps(cxt, propDeps);
			validateSchemaDeps(cxt, schDeps);
		}
	};
	function splitDependencies({ schema }) {
		const propertyDeps = {};
		const schemaDeps = {};
		for (const key in schema) {
			if (key === "__proto__") continue;
			const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
			deps[key] = schema[key];
		}
		return [propertyDeps, schemaDeps];
	}
	function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
		const { gen, data, it } = cxt;
		if (Object.keys(propertyDeps).length === 0) return;
		const missing = gen.let("missing");
		for (const prop in propertyDeps) {
			const deps = propertyDeps[prop];
			if (deps.length === 0) continue;
			const hasProperty = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
			cxt.setParams({
				property: prop,
				depsCount: deps.length,
				deps: deps.join(", ")
			});
			if (it.allErrors) gen.if(hasProperty, () => {
				for (const depProp of deps) (0, code_1.checkReportMissingProp)(cxt, depProp);
			});
			else {
				gen.if((0, codegen_1._)`${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
				(0, code_1.reportMissingProp)(cxt, missing);
				gen.else();
			}
		}
	}
	exports.validatePropertyDeps = validatePropertyDeps;
	function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
		const { gen, data, keyword, it } = cxt;
		const valid = gen.name("valid");
		for (const prop in schemaDeps) {
			if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop])) continue;
			gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties), () => {
				const schCxt = cxt.subschema({
					keyword,
					schemaProp: prop
				}, valid);
				cxt.mergeValidEvaluated(schCxt, valid);
			}, () => gen.var(valid, true));
			cxt.ok(valid);
		}
	}
	exports.validateSchemaDeps = validateSchemaDeps;
	exports.default = def;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/propertyNames.js
var require_propertyNames = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	exports.default = {
		keyword: "propertyNames",
		type: "object",
		schemaType: ["object", "boolean"],
		error: {
			message: "property name must be valid",
			params: ({ params }) => (0, codegen_1._)`{propertyName: ${params.propertyName}}`
		},
		code(cxt) {
			const { gen, schema, data, it } = cxt;
			if ((0, util_1.alwaysValidSchema)(it, schema)) return;
			const valid = gen.name("valid");
			gen.forIn("key", data, (key) => {
				cxt.setParams({ propertyName: key });
				cxt.subschema({
					keyword: "propertyNames",
					data: key,
					dataTypes: ["string"],
					propertyName: key,
					compositeRule: true
				}, valid);
				gen.if((0, codegen_1.not)(valid), () => {
					cxt.error(true);
					if (!it.allErrors) gen.break();
				});
			});
			cxt.ok(valid);
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js
var require_additionalProperties = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var code_1 = require_code();
	var codegen_1 = require_codegen();
	var names_1 = require_names();
	var util_1 = require_util();
	exports.default = {
		keyword: "additionalProperties",
		type: ["object"],
		schemaType: ["boolean", "object"],
		allowUndefined: true,
		trackErrors: true,
		error: {
			message: "must NOT have additional properties",
			params: ({ params }) => (0, codegen_1._)`{additionalProperty: ${params.additionalProperty}}`
		},
		code(cxt) {
			const { gen, schema, parentSchema, data, errsCount, it } = cxt;
			/* istanbul ignore if */
			if (!errsCount) throw new Error("ajv implementation error");
			const { allErrors, opts } = it;
			it.props = true;
			if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema)) return;
			const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
			const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
			checkAdditionalProperties();
			cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
			function checkAdditionalProperties() {
				gen.forIn("key", data, (key) => {
					if (!props.length && !patProps.length) additionalPropertyCode(key);
					else gen.if(isAdditional(key), () => additionalPropertyCode(key));
				});
			}
			function isAdditional(key) {
				let definedProp;
				if (props.length > 8) {
					const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
					definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
				} else if (props.length) definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._)`${key} === ${p}`));
				else definedProp = codegen_1.nil;
				if (patProps.length) definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._)`${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
				return (0, codegen_1.not)(definedProp);
			}
			function deleteAdditional(key) {
				gen.code((0, codegen_1._)`delete ${data}[${key}]`);
			}
			function additionalPropertyCode(key) {
				if (opts.removeAdditional === "all" || opts.removeAdditional && schema === false) {
					deleteAdditional(key);
					return;
				}
				if (schema === false) {
					cxt.setParams({ additionalProperty: key });
					cxt.error();
					if (!allErrors) gen.break();
					return;
				}
				if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
					const valid = gen.name("valid");
					if (opts.removeAdditional === "failing") {
						applyAdditionalSchema(key, valid, false);
						gen.if((0, codegen_1.not)(valid), () => {
							cxt.reset();
							deleteAdditional(key);
						});
					} else {
						applyAdditionalSchema(key, valid);
						if (!allErrors) gen.if((0, codegen_1.not)(valid), () => gen.break());
					}
				}
			}
			function applyAdditionalSchema(key, valid, errors) {
				const subschema = {
					keyword: "additionalProperties",
					dataProp: key,
					dataPropType: util_1.Type.Str
				};
				if (errors === false) Object.assign(subschema, {
					compositeRule: true,
					createErrors: false,
					allErrors: false
				});
				cxt.subschema(subschema, valid);
			}
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/properties.js
var require_properties = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var validate_1 = require_validate();
	var code_1 = require_code();
	var util_1 = require_util();
	var additionalProperties_1 = require_additionalProperties();
	exports.default = {
		keyword: "properties",
		type: "object",
		schemaType: "object",
		code(cxt) {
			const { gen, schema, parentSchema, data, it } = cxt;
			if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === void 0) additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
			const allProps = (0, code_1.allSchemaProperties)(schema);
			for (const prop of allProps) it.definedProperties.add(prop);
			if (it.opts.unevaluated && allProps.length && it.props !== true) it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
			const properties = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema[p]));
			if (properties.length === 0) return;
			const valid = gen.name("valid");
			for (const prop of properties) {
				if (hasDefault(prop)) applyPropertySchema(prop);
				else {
					gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
					applyPropertySchema(prop);
					if (!it.allErrors) gen.else().var(valid, true);
					gen.endIf();
				}
				cxt.it.definedProperties.add(prop);
				cxt.ok(valid);
			}
			function hasDefault(prop) {
				return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== void 0;
			}
			function applyPropertySchema(prop) {
				cxt.subschema({
					keyword: "properties",
					schemaProp: prop,
					dataProp: prop
				}, valid);
			}
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/patternProperties.js
var require_patternProperties = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var code_1 = require_code();
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	var util_2 = require_util();
	exports.default = {
		keyword: "patternProperties",
		type: "object",
		schemaType: "object",
		code(cxt) {
			const { gen, schema, data, parentSchema, it } = cxt;
			const { opts } = it;
			const patterns = (0, code_1.allSchemaProperties)(schema);
			const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema[p]));
			if (patterns.length === 0 || alwaysValidPatterns.length === patterns.length && (!it.opts.unevaluated || it.props === true)) return;
			const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
			const valid = gen.name("valid");
			if (it.props !== true && !(it.props instanceof codegen_1.Name)) it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
			const { props } = it;
			validatePatternProperties();
			function validatePatternProperties() {
				for (const pat of patterns) {
					if (checkProperties) checkMatchingProperties(pat);
					if (it.allErrors) validateProperties(pat);
					else {
						gen.var(valid, true);
						validateProperties(pat);
						gen.if(valid);
					}
				}
			}
			function checkMatchingProperties(pat) {
				for (const prop in checkProperties) if (new RegExp(pat).test(prop)) (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
			}
			function validateProperties(pat) {
				gen.forIn("key", data, (key) => {
					gen.if((0, codegen_1._)`${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
						const alwaysValid = alwaysValidPatterns.includes(pat);
						if (!alwaysValid) cxt.subschema({
							keyword: "patternProperties",
							schemaProp: pat,
							dataProp: key,
							dataPropType: util_2.Type.Str
						}, valid);
						if (it.opts.unevaluated && props !== true) gen.assign((0, codegen_1._)`${props}[${key}]`, true);
						else if (!alwaysValid && !it.allErrors) gen.if((0, codegen_1.not)(valid), () => gen.break());
					});
				});
			}
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/not.js
var require_not = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var util_1 = require_util();
	exports.default = {
		keyword: "not",
		schemaType: ["object", "boolean"],
		trackErrors: true,
		code(cxt) {
			const { gen, schema, it } = cxt;
			if ((0, util_1.alwaysValidSchema)(it, schema)) {
				cxt.fail();
				return;
			}
			const valid = gen.name("valid");
			cxt.subschema({
				keyword: "not",
				compositeRule: true,
				createErrors: false,
				allErrors: false
			}, valid);
			cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
		},
		error: { message: "must NOT be valid" }
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/anyOf.js
var require_anyOf = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.default = {
		keyword: "anyOf",
		schemaType: "array",
		trackErrors: true,
		code: require_code().validateUnion,
		error: { message: "must match a schema in anyOf" }
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/oneOf.js
var require_oneOf = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	exports.default = {
		keyword: "oneOf",
		schemaType: "array",
		trackErrors: true,
		error: {
			message: "must match exactly one schema in oneOf",
			params: ({ params }) => (0, codegen_1._)`{passingSchemas: ${params.passing}}`
		},
		code(cxt) {
			const { gen, schema, parentSchema, it } = cxt;
			/* istanbul ignore if */
			if (!Array.isArray(schema)) throw new Error("ajv implementation error");
			if (it.opts.discriminator && parentSchema.discriminator) return;
			const schArr = schema;
			const valid = gen.let("valid", false);
			const passing = gen.let("passing", null);
			const schValid = gen.name("_valid");
			cxt.setParams({ passing });
			gen.block(validateOneOf);
			cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
			function validateOneOf() {
				schArr.forEach((sch, i) => {
					let schCxt;
					if ((0, util_1.alwaysValidSchema)(it, sch)) gen.var(schValid, true);
					else schCxt = cxt.subschema({
						keyword: "oneOf",
						schemaProp: i,
						compositeRule: true
					}, schValid);
					if (i > 0) gen.if((0, codegen_1._)`${schValid} && ${valid}`).assign(valid, false).assign(passing, (0, codegen_1._)`[${passing}, ${i}]`).else();
					gen.if(schValid, () => {
						gen.assign(valid, true);
						gen.assign(passing, i);
						if (schCxt) cxt.mergeEvaluated(schCxt, codegen_1.Name);
					});
				});
			}
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/allOf.js
var require_allOf = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var util_1 = require_util();
	exports.default = {
		keyword: "allOf",
		schemaType: "array",
		code(cxt) {
			const { gen, schema, it } = cxt;
			/* istanbul ignore if */
			if (!Array.isArray(schema)) throw new Error("ajv implementation error");
			const valid = gen.name("valid");
			schema.forEach((sch, i) => {
				if ((0, util_1.alwaysValidSchema)(it, sch)) return;
				const schCxt = cxt.subschema({
					keyword: "allOf",
					schemaProp: i
				}, valid);
				cxt.ok(valid);
				cxt.mergeEvaluated(schCxt);
			});
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/if.js
var require_if = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	var def = {
		keyword: "if",
		schemaType: ["object", "boolean"],
		trackErrors: true,
		error: {
			message: ({ params }) => (0, codegen_1.str)`must match "${params.ifClause}" schema`,
			params: ({ params }) => (0, codegen_1._)`{failingKeyword: ${params.ifClause}}`
		},
		code(cxt) {
			const { gen, parentSchema, it } = cxt;
			if (parentSchema.then === void 0 && parentSchema.else === void 0) (0, util_1.checkStrictMode)(it, "\"if\" without \"then\" and \"else\" is ignored");
			const hasThen = hasSchema(it, "then");
			const hasElse = hasSchema(it, "else");
			if (!hasThen && !hasElse) return;
			const valid = gen.let("valid", true);
			const schValid = gen.name("_valid");
			validateIf();
			cxt.reset();
			if (hasThen && hasElse) {
				const ifClause = gen.let("ifClause");
				cxt.setParams({ ifClause });
				gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
			} else if (hasThen) gen.if(schValid, validateClause("then"));
			else gen.if((0, codegen_1.not)(schValid), validateClause("else"));
			cxt.pass(valid, () => cxt.error(true));
			function validateIf() {
				const schCxt = cxt.subschema({
					keyword: "if",
					compositeRule: true,
					createErrors: false,
					allErrors: false
				}, schValid);
				cxt.mergeEvaluated(schCxt);
			}
			function validateClause(keyword, ifClause) {
				return () => {
					const schCxt = cxt.subschema({ keyword }, schValid);
					gen.assign(valid, schValid);
					cxt.mergeValidEvaluated(schCxt, valid);
					if (ifClause) gen.assign(ifClause, (0, codegen_1._)`${keyword}`);
					else cxt.setParams({ ifClause: keyword });
				};
			}
		}
	};
	function hasSchema(it, keyword) {
		const schema = it.schema[keyword];
		return schema !== void 0 && !(0, util_1.alwaysValidSchema)(it, schema);
	}
	exports.default = def;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/thenElse.js
var require_thenElse = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var util_1 = require_util();
	exports.default = {
		keyword: ["then", "else"],
		schemaType: ["object", "boolean"],
		code({ keyword, parentSchema, it }) {
			if (parentSchema.if === void 0) (0, util_1.checkStrictMode)(it, `"${keyword}" without "if" is ignored`);
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/index.js
var require_applicator = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var additionalItems_1 = require_additionalItems();
	var prefixItems_1 = require_prefixItems();
	var items_1 = require_items();
	var items2020_1 = require_items2020();
	var contains_1 = require_contains();
	var dependencies_1 = require_dependencies();
	var propertyNames_1 = require_propertyNames();
	var additionalProperties_1 = require_additionalProperties();
	var properties_1 = require_properties();
	var patternProperties_1 = require_patternProperties();
	var not_1 = require_not();
	var anyOf_1 = require_anyOf();
	var oneOf_1 = require_oneOf();
	var allOf_1 = require_allOf();
	var if_1 = require_if();
	var thenElse_1 = require_thenElse();
	function getApplicator(draft2020 = false) {
		const applicator = [
			not_1.default,
			anyOf_1.default,
			oneOf_1.default,
			allOf_1.default,
			if_1.default,
			thenElse_1.default,
			propertyNames_1.default,
			additionalProperties_1.default,
			dependencies_1.default,
			properties_1.default,
			patternProperties_1.default
		];
		if (draft2020) applicator.push(prefixItems_1.default, items2020_1.default);
		else applicator.push(additionalItems_1.default, items_1.default);
		applicator.push(contains_1.default);
		return applicator;
	}
	exports.default = getApplicator;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/dynamic/dynamicAnchor.js
var require_dynamicAnchor = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.dynamicAnchor = void 0;
	var codegen_1 = require_codegen();
	var names_1 = require_names();
	var compile_1 = require_compile();
	var ref_1 = require_ref();
	var def = {
		keyword: "$dynamicAnchor",
		schemaType: "string",
		code: (cxt) => dynamicAnchor(cxt, cxt.schema)
	};
	function dynamicAnchor(cxt, anchor) {
		const { gen, it } = cxt;
		it.schemaEnv.root.dynamicAnchors[anchor] = true;
		const v = (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`;
		const validate = it.errSchemaPath === "#" ? it.validateName : _getValidate(cxt);
		gen.if((0, codegen_1._)`!${v}`, () => gen.assign(v, validate));
	}
	exports.dynamicAnchor = dynamicAnchor;
	function _getValidate(cxt) {
		const { schemaEnv, schema, self } = cxt.it;
		const { root, baseId, localRefs, meta } = schemaEnv.root;
		const { schemaId } = self.opts;
		const sch = new compile_1.SchemaEnv({
			schema,
			schemaId,
			root,
			baseId,
			localRefs,
			meta
		});
		compile_1.compileSchema.call(self, sch);
		return (0, ref_1.getValidate)(cxt, sch);
	}
	exports.default = def;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/dynamic/dynamicRef.js
var require_dynamicRef = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.dynamicRef = void 0;
	var codegen_1 = require_codegen();
	var names_1 = require_names();
	var ref_1 = require_ref();
	var def = {
		keyword: "$dynamicRef",
		schemaType: "string",
		code: (cxt) => dynamicRef(cxt, cxt.schema)
	};
	function dynamicRef(cxt, ref) {
		const { gen, keyword, it } = cxt;
		if (ref[0] !== "#") throw new Error(`"${keyword}" only supports hash fragment reference`);
		const anchor = ref.slice(1);
		if (it.allErrors) _dynamicRef();
		else {
			const valid = gen.let("valid", false);
			_dynamicRef(valid);
			cxt.ok(valid);
		}
		function _dynamicRef(valid) {
			if (it.schemaEnv.root.dynamicAnchors[anchor]) {
				const v = gen.let("_v", (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`);
				gen.if(v, _callRef(v, valid), _callRef(it.validateName, valid));
			} else _callRef(it.validateName, valid)();
		}
		function _callRef(validate, valid) {
			return valid ? () => gen.block(() => {
				(0, ref_1.callRef)(cxt, validate);
				gen.let(valid, true);
			}) : () => (0, ref_1.callRef)(cxt, validate);
		}
	}
	exports.dynamicRef = dynamicRef;
	exports.default = def;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/dynamic/recursiveAnchor.js
var require_recursiveAnchor = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var dynamicAnchor_1 = require_dynamicAnchor();
	var util_1 = require_util();
	exports.default = {
		keyword: "$recursiveAnchor",
		schemaType: "boolean",
		code(cxt) {
			if (cxt.schema) (0, dynamicAnchor_1.dynamicAnchor)(cxt, "");
			else (0, util_1.checkStrictMode)(cxt.it, "$recursiveAnchor: false is ignored");
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js
var require_recursiveRef = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var dynamicRef_1 = require_dynamicRef();
	exports.default = {
		keyword: "$recursiveRef",
		schemaType: "string",
		code: (cxt) => (0, dynamicRef_1.dynamicRef)(cxt, cxt.schema)
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/dynamic/index.js
var require_dynamic = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var dynamicAnchor_1 = require_dynamicAnchor();
	var dynamicRef_1 = require_dynamicRef();
	var recursiveAnchor_1 = require_recursiveAnchor();
	var recursiveRef_1 = require_recursiveRef();
	exports.default = [
		dynamicAnchor_1.default,
		dynamicRef_1.default,
		recursiveAnchor_1.default,
		recursiveRef_1.default
	];
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/dependentRequired.js
var require_dependentRequired = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var dependencies_1 = require_dependencies();
	exports.default = {
		keyword: "dependentRequired",
		type: "object",
		schemaType: "object",
		error: dependencies_1.error,
		code: (cxt) => (0, dependencies_1.validatePropertyDeps)(cxt)
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/dependentSchemas.js
var require_dependentSchemas = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var dependencies_1 = require_dependencies();
	exports.default = {
		keyword: "dependentSchemas",
		type: "object",
		schemaType: "object",
		code: (cxt) => (0, dependencies_1.validateSchemaDeps)(cxt)
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/limitContains.js
var require_limitContains = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var util_1 = require_util();
	exports.default = {
		keyword: ["maxContains", "minContains"],
		type: "array",
		schemaType: "number",
		code({ keyword, parentSchema, it }) {
			if (parentSchema.contains === void 0) (0, util_1.checkStrictMode)(it, `"${keyword}" without "contains" is ignored`);
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/next.js
var require_next = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var dependentRequired_1 = require_dependentRequired();
	var dependentSchemas_1 = require_dependentSchemas();
	var limitContains_1 = require_limitContains();
	exports.default = [
		dependentRequired_1.default,
		dependentSchemas_1.default,
		limitContains_1.default
	];
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedProperties.js
var require_unevaluatedProperties = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	var names_1 = require_names();
	exports.default = {
		keyword: "unevaluatedProperties",
		type: "object",
		schemaType: ["boolean", "object"],
		trackErrors: true,
		error: {
			message: "must NOT have unevaluated properties",
			params: ({ params }) => (0, codegen_1._)`{unevaluatedProperty: ${params.unevaluatedProperty}}`
		},
		code(cxt) {
			const { gen, schema, data, errsCount, it } = cxt;
			/* istanbul ignore if */
			if (!errsCount) throw new Error("ajv implementation error");
			const { allErrors, props } = it;
			if (props instanceof codegen_1.Name) gen.if((0, codegen_1._)`${props} !== true`, () => gen.forIn("key", data, (key) => gen.if(unevaluatedDynamic(props, key), () => unevaluatedPropCode(key))));
			else if (props !== true) gen.forIn("key", data, (key) => props === void 0 ? unevaluatedPropCode(key) : gen.if(unevaluatedStatic(props, key), () => unevaluatedPropCode(key)));
			it.props = true;
			cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
			function unevaluatedPropCode(key) {
				if (schema === false) {
					cxt.setParams({ unevaluatedProperty: key });
					cxt.error();
					if (!allErrors) gen.break();
					return;
				}
				if (!(0, util_1.alwaysValidSchema)(it, schema)) {
					const valid = gen.name("valid");
					cxt.subschema({
						keyword: "unevaluatedProperties",
						dataProp: key,
						dataPropType: util_1.Type.Str
					}, valid);
					if (!allErrors) gen.if((0, codegen_1.not)(valid), () => gen.break());
				}
			}
			function unevaluatedDynamic(evaluatedProps, key) {
				return (0, codegen_1._)`!${evaluatedProps} || !${evaluatedProps}[${key}]`;
			}
			function unevaluatedStatic(evaluatedProps, key) {
				const ps = [];
				for (const p in evaluatedProps) if (evaluatedProps[p] === true) ps.push((0, codegen_1._)`${key} !== ${p}`);
				return (0, codegen_1.and)(...ps);
			}
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedItems.js
var require_unevaluatedItems = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var codegen_1 = require_codegen();
	var util_1 = require_util();
	exports.default = {
		keyword: "unevaluatedItems",
		type: "array",
		schemaType: ["boolean", "object"],
		error: {
			message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
			params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
		},
		code(cxt) {
			const { gen, schema, data, it } = cxt;
			const items = it.items || 0;
			if (items === true) return;
			const len = gen.const("len", (0, codegen_1._)`${data}.length`);
			if (schema === false) {
				cxt.setParams({ len: items });
				cxt.fail((0, codegen_1._)`${len} > ${items}`);
			} else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
				const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items}`);
				gen.if((0, codegen_1.not)(valid), () => validateItems(valid, items));
				cxt.ok(valid);
			}
			it.items = true;
			function validateItems(valid, from) {
				gen.forRange("i", from, len, (i) => {
					cxt.subschema({
						keyword: "unevaluatedItems",
						dataProp: i,
						dataPropType: util_1.Type.Num
					}, valid);
					if (!it.allErrors) gen.if((0, codegen_1.not)(valid), () => gen.break());
				});
			}
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/unevaluated/index.js
var require_unevaluated = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var unevaluatedProperties_1 = require_unevaluatedProperties();
	var unevaluatedItems_1 = require_unevaluatedItems();
	exports.default = [unevaluatedProperties_1.default, unevaluatedItems_1.default];
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/format/format.js
var require_format$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var codegen_1 = require_codegen();
	exports.default = {
		keyword: "format",
		type: ["number", "string"],
		schemaType: "string",
		$data: true,
		error: {
			message: ({ schemaCode }) => (0, codegen_1.str)`must match format "${schemaCode}"`,
			params: ({ schemaCode }) => (0, codegen_1._)`{format: ${schemaCode}}`
		},
		code(cxt, ruleType) {
			const { gen, data, $data, schema, schemaCode, it } = cxt;
			const { opts, errSchemaPath, schemaEnv, self } = it;
			if (!opts.validateFormats) return;
			if ($data) validate$DataFormat();
			else validateFormat();
			function validate$DataFormat() {
				const fmts = gen.scopeValue("formats", {
					ref: self.formats,
					code: opts.code.formats
				});
				const fDef = gen.const("fDef", (0, codegen_1._)`${fmts}[${schemaCode}]`);
				const fType = gen.let("fType");
				const format = gen.let("format");
				gen.if((0, codegen_1._)`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._)`${fDef}.type || "string"`).assign(format, (0, codegen_1._)`${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._)`"string"`).assign(format, fDef));
				cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
				function unknownFmt() {
					if (opts.strictSchema === false) return codegen_1.nil;
					return (0, codegen_1._)`${schemaCode} && !${format}`;
				}
				function invalidFmt() {
					const callFormat = schemaEnv.$async ? (0, codegen_1._)`(${fDef}.async ? await ${format}(${data}) : ${format}(${data}))` : (0, codegen_1._)`${format}(${data})`;
					const validData = (0, codegen_1._)`(typeof ${format} == "function" ? ${callFormat} : ${format}.test(${data}))`;
					return (0, codegen_1._)`${format} && ${format} !== true && ${fType} === ${ruleType} && !${validData}`;
				}
			}
			function validateFormat() {
				const formatDef = self.formats[schema];
				if (!formatDef) {
					unknownFormat();
					return;
				}
				if (formatDef === true) return;
				const [fmtType, format, fmtRef] = getFormat(formatDef);
				if (fmtType === ruleType) cxt.pass(validCondition());
				function unknownFormat() {
					if (opts.strictSchema === false) {
						self.logger.warn(unknownMsg());
						return;
					}
					throw new Error(unknownMsg());
					function unknownMsg() {
						return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
					}
				}
				function getFormat(fmtDef) {
					const code = fmtDef instanceof RegExp ? (0, codegen_1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(schema)}` : void 0;
					const fmt = gen.scopeValue("formats", {
						key: schema,
						ref: fmtDef,
						code
					});
					if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) return [
						fmtDef.type || "string",
						fmtDef.validate,
						(0, codegen_1._)`${fmt}.validate`
					];
					return [
						"string",
						fmtDef,
						fmt
					];
				}
				function validCondition() {
					if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
						if (!schemaEnv.$async) throw new Error("async format in sync schema");
						return (0, codegen_1._)`await ${fmtRef}(${data})`;
					}
					return typeof format == "function" ? (0, codegen_1._)`${fmtRef}(${data})` : (0, codegen_1._)`${fmtRef}.test(${data})`;
				}
			}
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/format/index.js
var require_format = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.default = [require_format$1().default];
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/metadata.js
var require_metadata = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.contentVocabulary = exports.metadataVocabulary = void 0;
	exports.metadataVocabulary = [
		"title",
		"description",
		"default",
		"deprecated",
		"readOnly",
		"writeOnly",
		"examples"
	];
	exports.contentVocabulary = [
		"contentMediaType",
		"contentEncoding",
		"contentSchema"
	];
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/draft2020.js
var require_draft2020 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var core_1 = require_core();
	var validation_1 = require_validation();
	var applicator_1 = require_applicator();
	var dynamic_1 = require_dynamic();
	var next_1 = require_next();
	var unevaluated_1 = require_unevaluated();
	var format_1 = require_format();
	var metadata_1 = require_metadata();
	exports.default = [
		dynamic_1.default,
		core_1.default,
		validation_1.default,
		(0, applicator_1.default)(true),
		format_1.default,
		metadata_1.metadataVocabulary,
		metadata_1.contentVocabulary,
		next_1.default,
		unevaluated_1.default
	];
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/discriminator/types.js
var require_types = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.DiscrError = void 0;
	var DiscrError;
	(function(DiscrError) {
		DiscrError["Tag"] = "tag";
		DiscrError["Mapping"] = "mapping";
	})(DiscrError || (exports.DiscrError = DiscrError = {}));
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/discriminator/index.js
var require_discriminator = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var codegen_1 = require_codegen();
	var types_1 = require_types();
	var compile_1 = require_compile();
	var ref_error_1 = require_ref_error();
	var util_1 = require_util();
	exports.default = {
		keyword: "discriminator",
		type: "object",
		schemaType: "object",
		error: {
			message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`,
			params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._)`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
		},
		code(cxt) {
			const { gen, data, schema, parentSchema, it } = cxt;
			const { oneOf } = parentSchema;
			if (!it.opts.discriminator) throw new Error("discriminator: requires discriminator option");
			const tagName = schema.propertyName;
			if (typeof tagName != "string") throw new Error("discriminator: requires propertyName");
			if (schema.mapping) throw new Error("discriminator: mapping is not supported");
			if (!oneOf) throw new Error("discriminator: requires oneOf keyword");
			const valid = gen.let("valid", false);
			const tag = gen.const("tag", (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(tagName)}`);
			gen.if((0, codegen_1._)`typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, {
				discrError: types_1.DiscrError.Tag,
				tag,
				tagName
			}));
			cxt.ok(valid);
			function validateMapping() {
				const mapping = getMapping();
				gen.if(false);
				for (const tagValue in mapping) {
					gen.elseIf((0, codegen_1._)`${tag} === ${tagValue}`);
					gen.assign(valid, applyTagSchema(mapping[tagValue]));
				}
				gen.else();
				cxt.error(false, {
					discrError: types_1.DiscrError.Mapping,
					tag,
					tagName
				});
				gen.endIf();
			}
			function applyTagSchema(schemaProp) {
				const _valid = gen.name("valid");
				const schCxt = cxt.subschema({
					keyword: "oneOf",
					schemaProp
				}, _valid);
				cxt.mergeEvaluated(schCxt, codegen_1.Name);
				return _valid;
			}
			function getMapping() {
				var _a;
				const oneOfMapping = {};
				const topRequired = hasRequired(parentSchema);
				let tagRequired = true;
				for (let i = 0; i < oneOf.length; i++) {
					let sch = oneOf[i];
					if ((sch === null || sch === void 0 ? void 0 : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
						const ref = sch.$ref;
						sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref);
						if (sch instanceof compile_1.SchemaEnv) sch = sch.schema;
						if (sch === void 0) throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref);
					}
					const propSch = (_a = sch === null || sch === void 0 ? void 0 : sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
					if (typeof propSch != "object") throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
					tagRequired = tagRequired && (topRequired || hasRequired(sch));
					addMappings(propSch, i);
				}
				if (!tagRequired) throw new Error(`discriminator: "${tagName}" must be required`);
				return oneOfMapping;
				function hasRequired({ required }) {
					return Array.isArray(required) && required.includes(tagName);
				}
				function addMappings(sch, i) {
					if (sch.const) addMapping(sch.const, i);
					else if (sch.enum) for (const tagValue of sch.enum) addMapping(tagValue, i);
					else throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
				}
				function addMapping(tagValue, i) {
					if (typeof tagValue != "string" || tagValue in oneOfMapping) throw new Error(`discriminator: "${tagName}" values must be unique strings`);
					oneOfMapping[tagValue] = i;
				}
			}
		}
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/schema.json
var schema_exports = /* @__PURE__ */ __exportAll({
	$comment: () => $comment,
	$dynamicAnchor: () => $dynamicAnchor$7,
	$id: () => $id$8,
	$schema: () => $schema$8,
	$vocabulary: () => $vocabulary$7,
	allOf: () => allOf,
	default: () => schema_default,
	properties: () => properties$8,
	title: () => title$8,
	type: () => type$8
});
var $schema$8, $id$8, $vocabulary$7, $dynamicAnchor$7, title$8, allOf, type$8, $comment, properties$8, schema_default;
var init_schema = __esmMin((() => {
	$schema$8 = "https://json-schema.org/draft/2020-12/schema";
	$id$8 = "https://json-schema.org/draft/2020-12/schema";
	$vocabulary$7 = {
		"https://json-schema.org/draft/2020-12/vocab/core": true,
		"https://json-schema.org/draft/2020-12/vocab/applicator": true,
		"https://json-schema.org/draft/2020-12/vocab/unevaluated": true,
		"https://json-schema.org/draft/2020-12/vocab/validation": true,
		"https://json-schema.org/draft/2020-12/vocab/meta-data": true,
		"https://json-schema.org/draft/2020-12/vocab/format-annotation": true,
		"https://json-schema.org/draft/2020-12/vocab/content": true
	};
	$dynamicAnchor$7 = "meta";
	title$8 = "Core and Validation specifications meta-schema";
	allOf = [
		{ "$ref": "meta/core" },
		{ "$ref": "meta/applicator" },
		{ "$ref": "meta/unevaluated" },
		{ "$ref": "meta/validation" },
		{ "$ref": "meta/meta-data" },
		{ "$ref": "meta/format-annotation" },
		{ "$ref": "meta/content" }
	];
	type$8 = ["object", "boolean"];
	$comment = "This meta-schema also defines keywords that have appeared in previous drafts in order to prevent incompatible extensions as they remain in common use.";
	properties$8 = {
		"definitions": {
			"$comment": "\"definitions\" has been replaced by \"$defs\".",
			"type": "object",
			"additionalProperties": { "$dynamicRef": "#meta" },
			"deprecated": true,
			"default": {}
		},
		"dependencies": {
			"$comment": "\"dependencies\" has been split and replaced by \"dependentSchemas\" and \"dependentRequired\" in order to serve their differing semantics.",
			"type": "object",
			"additionalProperties": { "anyOf": [{ "$dynamicRef": "#meta" }, { "$ref": "meta/validation#/$defs/stringArray" }] },
			"deprecated": true,
			"default": {}
		},
		"$recursiveAnchor": {
			"$comment": "\"$recursiveAnchor\" has been replaced by \"$dynamicAnchor\".",
			"$ref": "meta/core#/$defs/anchorString",
			"deprecated": true
		},
		"$recursiveRef": {
			"$comment": "\"$recursiveRef\" has been replaced by \"$dynamicRef\".",
			"$ref": "meta/core#/$defs/uriReferenceString",
			"deprecated": true
		}
	};
	schema_default = {
		$schema: $schema$8,
		$id: $id$8,
		$vocabulary: $vocabulary$7,
		$dynamicAnchor: $dynamicAnchor$7,
		title: title$8,
		allOf,
		type: type$8,
		$comment,
		properties: properties$8
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/applicator.json
var applicator_exports = /* @__PURE__ */ __exportAll({
	$defs: () => $defs$2,
	$dynamicAnchor: () => $dynamicAnchor$6,
	$id: () => $id$7,
	$schema: () => $schema$7,
	$vocabulary: () => $vocabulary$6,
	default: () => applicator_default,
	properties: () => properties$7,
	title: () => title$7,
	type: () => type$7
});
var $schema$7, $id$7, $vocabulary$6, $dynamicAnchor$6, title$7, type$7, properties$7, $defs$2, applicator_default;
var init_applicator = __esmMin((() => {
	$schema$7 = "https://json-schema.org/draft/2020-12/schema";
	$id$7 = "https://json-schema.org/draft/2020-12/meta/applicator";
	$vocabulary$6 = { "https://json-schema.org/draft/2020-12/vocab/applicator": true };
	$dynamicAnchor$6 = "meta";
	title$7 = "Applicator vocabulary meta-schema";
	type$7 = ["object", "boolean"];
	properties$7 = {
		"prefixItems": { "$ref": "#/$defs/schemaArray" },
		"items": { "$dynamicRef": "#meta" },
		"contains": { "$dynamicRef": "#meta" },
		"additionalProperties": { "$dynamicRef": "#meta" },
		"properties": {
			"type": "object",
			"additionalProperties": { "$dynamicRef": "#meta" },
			"default": {}
		},
		"patternProperties": {
			"type": "object",
			"additionalProperties": { "$dynamicRef": "#meta" },
			"propertyNames": { "format": "regex" },
			"default": {}
		},
		"dependentSchemas": {
			"type": "object",
			"additionalProperties": { "$dynamicRef": "#meta" },
			"default": {}
		},
		"propertyNames": { "$dynamicRef": "#meta" },
		"if": { "$dynamicRef": "#meta" },
		"then": { "$dynamicRef": "#meta" },
		"else": { "$dynamicRef": "#meta" },
		"allOf": { "$ref": "#/$defs/schemaArray" },
		"anyOf": { "$ref": "#/$defs/schemaArray" },
		"oneOf": { "$ref": "#/$defs/schemaArray" },
		"not": { "$dynamicRef": "#meta" }
	};
	$defs$2 = { "schemaArray": {
		"type": "array",
		"minItems": 1,
		"items": { "$dynamicRef": "#meta" }
	} };
	applicator_default = {
		$schema: $schema$7,
		$id: $id$7,
		$vocabulary: $vocabulary$6,
		$dynamicAnchor: $dynamicAnchor$6,
		title: title$7,
		type: type$7,
		properties: properties$7,
		$defs: $defs$2
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json
var unevaluated_exports = /* @__PURE__ */ __exportAll({
	$dynamicAnchor: () => $dynamicAnchor$5,
	$id: () => $id$6,
	$schema: () => $schema$6,
	$vocabulary: () => $vocabulary$5,
	default: () => unevaluated_default,
	properties: () => properties$6,
	title: () => title$6,
	type: () => type$6
});
var $schema$6, $id$6, $vocabulary$5, $dynamicAnchor$5, title$6, type$6, properties$6, unevaluated_default;
var init_unevaluated = __esmMin((() => {
	$schema$6 = "https://json-schema.org/draft/2020-12/schema";
	$id$6 = "https://json-schema.org/draft/2020-12/meta/unevaluated";
	$vocabulary$5 = { "https://json-schema.org/draft/2020-12/vocab/unevaluated": true };
	$dynamicAnchor$5 = "meta";
	title$6 = "Unevaluated applicator vocabulary meta-schema";
	type$6 = ["object", "boolean"];
	properties$6 = {
		"unevaluatedItems": { "$dynamicRef": "#meta" },
		"unevaluatedProperties": { "$dynamicRef": "#meta" }
	};
	unevaluated_default = {
		$schema: $schema$6,
		$id: $id$6,
		$vocabulary: $vocabulary$5,
		$dynamicAnchor: $dynamicAnchor$5,
		title: title$6,
		type: type$6,
		properties: properties$6
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/content.json
var content_exports = /* @__PURE__ */ __exportAll({
	$dynamicAnchor: () => $dynamicAnchor$4,
	$id: () => $id$5,
	$schema: () => $schema$5,
	$vocabulary: () => $vocabulary$4,
	default: () => content_default,
	properties: () => properties$5,
	title: () => title$5,
	type: () => type$5
});
var $schema$5, $id$5, $vocabulary$4, $dynamicAnchor$4, title$5, type$5, properties$5, content_default;
var init_content = __esmMin((() => {
	$schema$5 = "https://json-schema.org/draft/2020-12/schema";
	$id$5 = "https://json-schema.org/draft/2020-12/meta/content";
	$vocabulary$4 = { "https://json-schema.org/draft/2020-12/vocab/content": true };
	$dynamicAnchor$4 = "meta";
	title$5 = "Content vocabulary meta-schema";
	type$5 = ["object", "boolean"];
	properties$5 = {
		"contentEncoding": { "type": "string" },
		"contentMediaType": { "type": "string" },
		"contentSchema": { "$dynamicRef": "#meta" }
	};
	content_default = {
		$schema: $schema$5,
		$id: $id$5,
		$vocabulary: $vocabulary$4,
		$dynamicAnchor: $dynamicAnchor$4,
		title: title$5,
		type: type$5,
		properties: properties$5
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/core.json
var core_exports = /* @__PURE__ */ __exportAll({
	$defs: () => $defs$1,
	$dynamicAnchor: () => $dynamicAnchor$3,
	$id: () => $id$4,
	$schema: () => $schema$4,
	$vocabulary: () => $vocabulary$3,
	default: () => core_default,
	properties: () => properties$4,
	title: () => title$4,
	type: () => type$4
});
var $schema$4, $id$4, $vocabulary$3, $dynamicAnchor$3, title$4, type$4, properties$4, $defs$1, core_default;
var init_core = __esmMin((() => {
	$schema$4 = "https://json-schema.org/draft/2020-12/schema";
	$id$4 = "https://json-schema.org/draft/2020-12/meta/core";
	$vocabulary$3 = { "https://json-schema.org/draft/2020-12/vocab/core": true };
	$dynamicAnchor$3 = "meta";
	title$4 = "Core vocabulary meta-schema";
	type$4 = ["object", "boolean"];
	properties$4 = {
		"$id": {
			"$ref": "#/$defs/uriReferenceString",
			"$comment": "Non-empty fragments not allowed.",
			"pattern": "^[^#]*#?$"
		},
		"$schema": { "$ref": "#/$defs/uriString" },
		"$ref": { "$ref": "#/$defs/uriReferenceString" },
		"$anchor": { "$ref": "#/$defs/anchorString" },
		"$dynamicRef": { "$ref": "#/$defs/uriReferenceString" },
		"$dynamicAnchor": { "$ref": "#/$defs/anchorString" },
		"$vocabulary": {
			"type": "object",
			"propertyNames": { "$ref": "#/$defs/uriString" },
			"additionalProperties": { "type": "boolean" }
		},
		"$comment": { "type": "string" },
		"$defs": {
			"type": "object",
			"additionalProperties": { "$dynamicRef": "#meta" }
		}
	};
	$defs$1 = {
		"anchorString": {
			"type": "string",
			"pattern": "^[A-Za-z_][-A-Za-z0-9._]*$"
		},
		"uriString": {
			"type": "string",
			"format": "uri"
		},
		"uriReferenceString": {
			"type": "string",
			"format": "uri-reference"
		}
	};
	core_default = {
		$schema: $schema$4,
		$id: $id$4,
		$vocabulary: $vocabulary$3,
		$dynamicAnchor: $dynamicAnchor$3,
		title: title$4,
		type: type$4,
		properties: properties$4,
		$defs: $defs$1
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json
var format_annotation_exports = /* @__PURE__ */ __exportAll({
	$dynamicAnchor: () => $dynamicAnchor$2,
	$id: () => $id$3,
	$schema: () => $schema$3,
	$vocabulary: () => $vocabulary$2,
	default: () => format_annotation_default,
	properties: () => properties$3,
	title: () => title$3,
	type: () => type$3
});
var $schema$3, $id$3, $vocabulary$2, $dynamicAnchor$2, title$3, type$3, properties$3, format_annotation_default;
var init_format_annotation = __esmMin((() => {
	$schema$3 = "https://json-schema.org/draft/2020-12/schema";
	$id$3 = "https://json-schema.org/draft/2020-12/meta/format-annotation";
	$vocabulary$2 = { "https://json-schema.org/draft/2020-12/vocab/format-annotation": true };
	$dynamicAnchor$2 = "meta";
	title$3 = "Format vocabulary meta-schema for annotation results";
	type$3 = ["object", "boolean"];
	properties$3 = { "format": { "type": "string" } };
	format_annotation_default = {
		$schema: $schema$3,
		$id: $id$3,
		$vocabulary: $vocabulary$2,
		$dynamicAnchor: $dynamicAnchor$2,
		title: title$3,
		type: type$3,
		properties: properties$3
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json
var meta_data_exports = /* @__PURE__ */ __exportAll({
	$dynamicAnchor: () => $dynamicAnchor$1,
	$id: () => $id$2,
	$schema: () => $schema$2,
	$vocabulary: () => $vocabulary$1,
	default: () => meta_data_default,
	properties: () => properties$2,
	title: () => title$2,
	type: () => type$2
});
var $schema$2, $id$2, $vocabulary$1, $dynamicAnchor$1, title$2, type$2, properties$2, meta_data_default;
var init_meta_data = __esmMin((() => {
	$schema$2 = "https://json-schema.org/draft/2020-12/schema";
	$id$2 = "https://json-schema.org/draft/2020-12/meta/meta-data";
	$vocabulary$1 = { "https://json-schema.org/draft/2020-12/vocab/meta-data": true };
	$dynamicAnchor$1 = "meta";
	title$2 = "Meta-data vocabulary meta-schema";
	type$2 = ["object", "boolean"];
	properties$2 = {
		"title": { "type": "string" },
		"description": { "type": "string" },
		"default": true,
		"deprecated": {
			"type": "boolean",
			"default": false
		},
		"readOnly": {
			"type": "boolean",
			"default": false
		},
		"writeOnly": {
			"type": "boolean",
			"default": false
		},
		"examples": {
			"type": "array",
			"items": true
		}
	};
	meta_data_default = {
		$schema: $schema$2,
		$id: $id$2,
		$vocabulary: $vocabulary$1,
		$dynamicAnchor: $dynamicAnchor$1,
		title: title$2,
		type: type$2,
		properties: properties$2
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/validation.json
var validation_exports = /* @__PURE__ */ __exportAll({
	$defs: () => $defs,
	$dynamicAnchor: () => $dynamicAnchor,
	$id: () => $id$1,
	$schema: () => $schema$1,
	$vocabulary: () => $vocabulary,
	default: () => validation_default,
	properties: () => properties$1,
	title: () => title$1,
	type: () => type$1
});
var $schema$1, $id$1, $vocabulary, $dynamicAnchor, title$1, type$1, properties$1, $defs, validation_default;
var init_validation = __esmMin((() => {
	$schema$1 = "https://json-schema.org/draft/2020-12/schema";
	$id$1 = "https://json-schema.org/draft/2020-12/meta/validation";
	$vocabulary = { "https://json-schema.org/draft/2020-12/vocab/validation": true };
	$dynamicAnchor = "meta";
	title$1 = "Validation vocabulary meta-schema";
	type$1 = ["object", "boolean"];
	properties$1 = {
		"type": { "anyOf": [{ "$ref": "#/$defs/simpleTypes" }, {
			"type": "array",
			"items": { "$ref": "#/$defs/simpleTypes" },
			"minItems": 1,
			"uniqueItems": true
		}] },
		"const": true,
		"enum": {
			"type": "array",
			"items": true
		},
		"multipleOf": {
			"type": "number",
			"exclusiveMinimum": 0
		},
		"maximum": { "type": "number" },
		"exclusiveMaximum": { "type": "number" },
		"minimum": { "type": "number" },
		"exclusiveMinimum": { "type": "number" },
		"maxLength": { "$ref": "#/$defs/nonNegativeInteger" },
		"minLength": { "$ref": "#/$defs/nonNegativeIntegerDefault0" },
		"pattern": {
			"type": "string",
			"format": "regex"
		},
		"maxItems": { "$ref": "#/$defs/nonNegativeInteger" },
		"minItems": { "$ref": "#/$defs/nonNegativeIntegerDefault0" },
		"uniqueItems": {
			"type": "boolean",
			"default": false
		},
		"maxContains": { "$ref": "#/$defs/nonNegativeInteger" },
		"minContains": {
			"$ref": "#/$defs/nonNegativeInteger",
			"default": 1
		},
		"maxProperties": { "$ref": "#/$defs/nonNegativeInteger" },
		"minProperties": { "$ref": "#/$defs/nonNegativeIntegerDefault0" },
		"required": { "$ref": "#/$defs/stringArray" },
		"dependentRequired": {
			"type": "object",
			"additionalProperties": { "$ref": "#/$defs/stringArray" }
		}
	};
	$defs = {
		"nonNegativeInteger": {
			"type": "integer",
			"minimum": 0
		},
		"nonNegativeIntegerDefault0": {
			"$ref": "#/$defs/nonNegativeInteger",
			"default": 0
		},
		"simpleTypes": { "enum": [
			"array",
			"boolean",
			"integer",
			"null",
			"number",
			"object",
			"string"
		] },
		"stringArray": {
			"type": "array",
			"items": { "type": "string" },
			"uniqueItems": true,
			"default": []
		}
	};
	validation_default = {
		$schema: $schema$1,
		$id: $id$1,
		$vocabulary,
		$dynamicAnchor,
		title: title$1,
		type: type$1,
		properties: properties$1,
		$defs
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/index.js
var require_json_schema_2020_12 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var metaSchema = (init_schema(), __toCommonJS(schema_exports).default);
	var applicator = (init_applicator(), __toCommonJS(applicator_exports).default);
	var unevaluated = (init_unevaluated(), __toCommonJS(unevaluated_exports).default);
	var content = (init_content(), __toCommonJS(content_exports).default);
	var core = (init_core(), __toCommonJS(core_exports).default);
	var format = (init_format_annotation(), __toCommonJS(format_annotation_exports).default);
	var metadata = (init_meta_data(), __toCommonJS(meta_data_exports).default);
	var validation = (init_validation(), __toCommonJS(validation_exports).default);
	var META_SUPPORT_DATA = ["/properties"];
	function addMetaSchema2020($data) {
		[
			metaSchema,
			applicator,
			unevaluated,
			content,
			core,
			with$data(this, format),
			metadata,
			with$data(this, validation)
		].forEach((sch) => this.addMetaSchema(sch, void 0, false));
		return this;
		function with$data(ajv, sch) {
			return $data ? ajv.$dataMetaSchema(sch, META_SUPPORT_DATA) : sch;
		}
	}
	exports.default = addMetaSchema2020;
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/2020.js
var require__2020 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv2020 = void 0;
	var core_1 = require_core$1();
	var draft2020_1 = require_draft2020();
	var discriminator_1 = require_discriminator();
	var json_schema_2020_12_1 = require_json_schema_2020_12();
	var META_SCHEMA_ID = "https://json-schema.org/draft/2020-12/schema";
	var Ajv2020 = class extends core_1.default {
		constructor(opts = {}) {
			super({
				...opts,
				dynamicRef: true,
				next: true,
				unevaluated: true
			});
		}
		_addVocabularies() {
			super._addVocabularies();
			draft2020_1.default.forEach((v) => this.addVocabulary(v));
			if (this.opts.discriminator) this.addKeyword(discriminator_1.default);
		}
		_addDefaultMetaSchema() {
			super._addDefaultMetaSchema();
			const { $data, meta } = this.opts;
			if (!meta) return;
			json_schema_2020_12_1.default.call(this, $data);
			this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
		}
		defaultMeta() {
			return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
		}
	};
	exports.Ajv2020 = Ajv2020;
	module.exports = exports = Ajv2020;
	module.exports.Ajv2020 = Ajv2020;
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.default = Ajv2020;
	var validate_1 = require_validate();
	Object.defineProperty(exports, "KeywordCxt", {
		enumerable: true,
		get: function() {
			return validate_1.KeywordCxt;
		}
	});
	var codegen_1 = require_codegen();
	Object.defineProperty(exports, "_", {
		enumerable: true,
		get: function() {
			return codegen_1._;
		}
	});
	Object.defineProperty(exports, "str", {
		enumerable: true,
		get: function() {
			return codegen_1.str;
		}
	});
	Object.defineProperty(exports, "stringify", {
		enumerable: true,
		get: function() {
			return codegen_1.stringify;
		}
	});
	Object.defineProperty(exports, "nil", {
		enumerable: true,
		get: function() {
			return codegen_1.nil;
		}
	});
	Object.defineProperty(exports, "Name", {
		enumerable: true,
		get: function() {
			return codegen_1.Name;
		}
	});
	Object.defineProperty(exports, "CodeGen", {
		enumerable: true,
		get: function() {
			return codegen_1.CodeGen;
		}
	});
	var validation_error_1 = require_validation_error();
	Object.defineProperty(exports, "ValidationError", {
		enumerable: true,
		get: function() {
			return validation_error_1.default;
		}
	});
	var ref_error_1 = require_ref_error();
	Object.defineProperty(exports, "MissingRefError", {
		enumerable: true,
		get: function() {
			return ref_error_1.default;
		}
	});
}));
// node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.20.0/node_modules/ajv-formats/dist/formats.js
var require_formats = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.formatNames = exports.fastFormats = exports.fullFormats = void 0;
	function fmtDef(validate, compare) {
		return {
			validate,
			compare
		};
	}
	exports.fullFormats = {
		date: fmtDef(date, compareDate),
		time: fmtDef(getTime(true), compareTime),
		"date-time": fmtDef(getDateTime(true), compareDateTime),
		"iso-time": fmtDef(getTime(), compareIsoTime),
		"iso-date-time": fmtDef(getDateTime(), compareIsoDateTime),
		duration: /^P(?!$)((\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?|(\d+W)?)$/,
		uri,
		"uri-reference": /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i,
		"uri-template": /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i,
		url: /^(?:https?|ftp):\/\/(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)(?:\.(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu,
		email: /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
		hostname: /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i,
		ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
		ipv6: /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i,
		regex,
		uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
		"json-pointer": /^(?:\/(?:[^~/]|~0|~1)*)*$/,
		"json-pointer-uri-fragment": /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i,
		"relative-json-pointer": /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,
		byte,
		int32: {
			type: "number",
			validate: validateInt32
		},
		int64: {
			type: "number",
			validate: validateInt64
		},
		float: {
			type: "number",
			validate: validateNumber
		},
		double: {
			type: "number",
			validate: validateNumber
		},
		password: true,
		binary: true
	};
	exports.fastFormats = {
		...exports.fullFormats,
		date: fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d$/, compareDate),
		time: fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareTime),
		"date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\dt(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareDateTime),
		"iso-time": fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoTime),
		"iso-date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d[t\s](?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoDateTime),
		uri: /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/)?[^\s]*$/i,
		"uri-reference": /^(?:(?:[a-z][a-z0-9+\-.]*:)?\/?\/)?(?:[^\\\s#][^\s#]*)?(?:#[^\\\s]*)?$/i,
		email: /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i
	};
	exports.formatNames = Object.keys(exports.fullFormats);
	function isLeapYear(year) {
		return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	}
	var DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
	var DAYS = [
		0,
		31,
		28,
		31,
		30,
		31,
		30,
		31,
		31,
		30,
		31,
		30,
		31
	];
	function date(str) {
		const matches = DATE.exec(str);
		if (!matches) return false;
		const year = +matches[1];
		const month = +matches[2];
		const day = +matches[3];
		return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && isLeapYear(year) ? 29 : DAYS[month]);
	}
	function compareDate(d1, d2) {
		if (!(d1 && d2)) return void 0;
		if (d1 > d2) return 1;
		if (d1 < d2) return -1;
		return 0;
	}
	var TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;
	function getTime(strictTimeZone) {
		return function time(str) {
			const matches = TIME.exec(str);
			if (!matches) return false;
			const hr = +matches[1];
			const min = +matches[2];
			const sec = +matches[3];
			const tz = matches[4];
			const tzSign = matches[5] === "-" ? -1 : 1;
			const tzH = +(matches[6] || 0);
			const tzM = +(matches[7] || 0);
			if (tzH > 23 || tzM > 59 || strictTimeZone && !tz) return false;
			if (hr <= 23 && min <= 59 && sec < 60) return true;
			const utcMin = min - tzM * tzSign;
			const utcHr = hr - tzH * tzSign - (utcMin < 0 ? 1 : 0);
			return (utcHr === 23 || utcHr === -1) && (utcMin === 59 || utcMin === -1) && sec < 61;
		};
	}
	function compareTime(s1, s2) {
		if (!(s1 && s2)) return void 0;
		const t1 = (/* @__PURE__ */ new Date("2020-01-01T" + s1)).valueOf();
		const t2 = (/* @__PURE__ */ new Date("2020-01-01T" + s2)).valueOf();
		if (!(t1 && t2)) return void 0;
		return t1 - t2;
	}
	function compareIsoTime(t1, t2) {
		if (!(t1 && t2)) return void 0;
		const a1 = TIME.exec(t1);
		const a2 = TIME.exec(t2);
		if (!(a1 && a2)) return void 0;
		t1 = a1[1] + a1[2] + a1[3];
		t2 = a2[1] + a2[2] + a2[3];
		if (t1 > t2) return 1;
		if (t1 < t2) return -1;
		return 0;
	}
	var DATE_TIME_SEPARATOR = /t|\s/i;
	function getDateTime(strictTimeZone) {
		const time = getTime(strictTimeZone);
		return function date_time(str) {
			const dateTime = str.split(DATE_TIME_SEPARATOR);
			return dateTime.length === 2 && date(dateTime[0]) && time(dateTime[1]);
		};
	}
	function compareDateTime(dt1, dt2) {
		if (!(dt1 && dt2)) return void 0;
		const d1 = new Date(dt1).valueOf();
		const d2 = new Date(dt2).valueOf();
		if (!(d1 && d2)) return void 0;
		return d1 - d2;
	}
	function compareIsoDateTime(dt1, dt2) {
		if (!(dt1 && dt2)) return void 0;
		const [d1, t1] = dt1.split(DATE_TIME_SEPARATOR);
		const [d2, t2] = dt2.split(DATE_TIME_SEPARATOR);
		const res = compareDate(d1, d2);
		if (res === void 0) return void 0;
		return res || compareTime(t1, t2);
	}
	var NOT_URI_FRAGMENT = /\/|:/;
	var URI = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
	function uri(str) {
		return NOT_URI_FRAGMENT.test(str) && URI.test(str);
	}
	var BYTE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/gm;
	function byte(str) {
		BYTE.lastIndex = 0;
		return BYTE.test(str);
	}
	var MIN_INT32 = -(2 ** 31);
	var MAX_INT32 = 2 ** 31 - 1;
	function validateInt32(value) {
		return Number.isInteger(value) && value <= MAX_INT32 && value >= MIN_INT32;
	}
	function validateInt64(value) {
		return Number.isInteger(value);
	}
	function validateNumber() {
		return true;
	}
	var Z_ANCHOR = /[^\\]\\Z/;
	function regex(str) {
		if (Z_ANCHOR.test(str)) return false;
		try {
			new RegExp(str);
			return true;
		} catch (e) {
			return false;
		}
	}
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/draft7.js
var require_draft7 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var core_1 = require_core();
	var validation_1 = require_validation();
	var applicator_1 = require_applicator();
	var format_1 = require_format();
	var metadata_1 = require_metadata();
	exports.default = [
		core_1.default,
		validation_1.default,
		(0, applicator_1.default)(),
		format_1.default,
		metadata_1.metadataVocabulary,
		metadata_1.contentVocabulary
	];
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-draft-07.json
var json_schema_draft_07_exports = /* @__PURE__ */ __exportAll({
	$id: () => $id,
	$schema: () => $schema,
	default: () => json_schema_draft_07_default,
	definitions: () => definitions,
	properties: () => properties,
	title: () => title,
	type: () => type
});
var $schema, $id, title, definitions, type, properties, json_schema_draft_07_default;
var init_json_schema_draft_07 = __esmMin((() => {
	$schema = "http://json-schema.org/draft-07/schema#";
	$id = "http://json-schema.org/draft-07/schema#";
	title = "Core schema meta-schema";
	definitions = {
		"schemaArray": {
			"type": "array",
			"minItems": 1,
			"items": { "$ref": "#" }
		},
		"nonNegativeInteger": {
			"type": "integer",
			"minimum": 0
		},
		"nonNegativeIntegerDefault0": { "allOf": [{ "$ref": "#/definitions/nonNegativeInteger" }, { "default": 0 }] },
		"simpleTypes": { "enum": [
			"array",
			"boolean",
			"integer",
			"null",
			"number",
			"object",
			"string"
		] },
		"stringArray": {
			"type": "array",
			"items": { "type": "string" },
			"uniqueItems": true,
			"default": []
		}
	};
	type = ["object", "boolean"];
	properties = {
		"$id": {
			"type": "string",
			"format": "uri-reference"
		},
		"$schema": {
			"type": "string",
			"format": "uri"
		},
		"$ref": {
			"type": "string",
			"format": "uri-reference"
		},
		"$comment": { "type": "string" },
		"title": { "type": "string" },
		"description": { "type": "string" },
		"default": true,
		"readOnly": {
			"type": "boolean",
			"default": false
		},
		"examples": {
			"type": "array",
			"items": true
		},
		"multipleOf": {
			"type": "number",
			"exclusiveMinimum": 0
		},
		"maximum": { "type": "number" },
		"exclusiveMaximum": { "type": "number" },
		"minimum": { "type": "number" },
		"exclusiveMinimum": { "type": "number" },
		"maxLength": { "$ref": "#/definitions/nonNegativeInteger" },
		"minLength": { "$ref": "#/definitions/nonNegativeIntegerDefault0" },
		"pattern": {
			"type": "string",
			"format": "regex"
		},
		"additionalItems": { "$ref": "#" },
		"items": {
			"anyOf": [{ "$ref": "#" }, { "$ref": "#/definitions/schemaArray" }],
			"default": true
		},
		"maxItems": { "$ref": "#/definitions/nonNegativeInteger" },
		"minItems": { "$ref": "#/definitions/nonNegativeIntegerDefault0" },
		"uniqueItems": {
			"type": "boolean",
			"default": false
		},
		"contains": { "$ref": "#" },
		"maxProperties": { "$ref": "#/definitions/nonNegativeInteger" },
		"minProperties": { "$ref": "#/definitions/nonNegativeIntegerDefault0" },
		"required": { "$ref": "#/definitions/stringArray" },
		"additionalProperties": { "$ref": "#" },
		"definitions": {
			"type": "object",
			"additionalProperties": { "$ref": "#" },
			"default": {}
		},
		"properties": {
			"type": "object",
			"additionalProperties": { "$ref": "#" },
			"default": {}
		},
		"patternProperties": {
			"type": "object",
			"additionalProperties": { "$ref": "#" },
			"propertyNames": { "format": "regex" },
			"default": {}
		},
		"dependencies": {
			"type": "object",
			"additionalProperties": { "anyOf": [{ "$ref": "#" }, { "$ref": "#/definitions/stringArray" }] }
		},
		"propertyNames": { "$ref": "#" },
		"const": true,
		"enum": {
			"type": "array",
			"items": true,
			"minItems": 1,
			"uniqueItems": true
		},
		"type": { "anyOf": [{ "$ref": "#/definitions/simpleTypes" }, {
			"type": "array",
			"items": { "$ref": "#/definitions/simpleTypes" },
			"minItems": 1,
			"uniqueItems": true
		}] },
		"format": { "type": "string" },
		"contentMediaType": { "type": "string" },
		"contentEncoding": { "type": "string" },
		"if": { "$ref": "#" },
		"then": { "$ref": "#" },
		"else": { "$ref": "#" },
		"allOf": { "$ref": "#/definitions/schemaArray" },
		"anyOf": { "$ref": "#/definitions/schemaArray" },
		"oneOf": { "$ref": "#/definitions/schemaArray" },
		"not": { "$ref": "#" }
	};
	json_schema_draft_07_default = {
		$schema,
		$id,
		title,
		definitions,
		type,
		properties,
		"default": true
	};
}));
// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/ajv.js
var require_ajv = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv = void 0;
	var core_1 = require_core$1();
	var draft7_1 = require_draft7();
	var discriminator_1 = require_discriminator();
	var draft7MetaSchema = (init_json_schema_draft_07(), __toCommonJS(json_schema_draft_07_exports).default);
	var META_SUPPORT_DATA = ["/properties"];
	var META_SCHEMA_ID = "http://json-schema.org/draft-07/schema";
	var Ajv = class extends core_1.default {
		_addVocabularies() {
			super._addVocabularies();
			draft7_1.default.forEach((v) => this.addVocabulary(v));
			if (this.opts.discriminator) this.addKeyword(discriminator_1.default);
		}
		_addDefaultMetaSchema() {
			super._addDefaultMetaSchema();
			if (!this.opts.meta) return;
			const metaSchema = this.opts.$data ? this.$dataMetaSchema(draft7MetaSchema, META_SUPPORT_DATA) : draft7MetaSchema;
			this.addMetaSchema(metaSchema, META_SCHEMA_ID, false);
			this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
		}
		defaultMeta() {
			return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
		}
	};
	exports.Ajv = Ajv;
	module.exports = exports = Ajv;
	module.exports.Ajv = Ajv;
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.default = Ajv;
	var validate_1 = require_validate();
	Object.defineProperty(exports, "KeywordCxt", {
		enumerable: true,
		get: function() {
			return validate_1.KeywordCxt;
		}
	});
	var codegen_1 = require_codegen();
	Object.defineProperty(exports, "_", {
		enumerable: true,
		get: function() {
			return codegen_1._;
		}
	});
	Object.defineProperty(exports, "str", {
		enumerable: true,
		get: function() {
			return codegen_1.str;
		}
	});
	Object.defineProperty(exports, "stringify", {
		enumerable: true,
		get: function() {
			return codegen_1.stringify;
		}
	});
	Object.defineProperty(exports, "nil", {
		enumerable: true,
		get: function() {
			return codegen_1.nil;
		}
	});
	Object.defineProperty(exports, "Name", {
		enumerable: true,
		get: function() {
			return codegen_1.Name;
		}
	});
	Object.defineProperty(exports, "CodeGen", {
		enumerable: true,
		get: function() {
			return codegen_1.CodeGen;
		}
	});
	var validation_error_1 = require_validation_error();
	Object.defineProperty(exports, "ValidationError", {
		enumerable: true,
		get: function() {
			return validation_error_1.default;
		}
	});
	var ref_error_1 = require_ref_error();
	Object.defineProperty(exports, "MissingRefError", {
		enumerable: true,
		get: function() {
			return ref_error_1.default;
		}
	});
}));
// node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.20.0/node_modules/ajv-formats/dist/limit.js
var require_limit = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.formatLimitDefinition = void 0;
	var ajv_1 = require_ajv();
	var codegen_1 = require_codegen();
	var ops = codegen_1.operators;
	var KWDs = {
		formatMaximum: {
			okStr: "<=",
			ok: ops.LTE,
			fail: ops.GT
		},
		formatMinimum: {
			okStr: ">=",
			ok: ops.GTE,
			fail: ops.LT
		},
		formatExclusiveMaximum: {
			okStr: "<",
			ok: ops.LT,
			fail: ops.GTE
		},
		formatExclusiveMinimum: {
			okStr: ">",
			ok: ops.GT,
			fail: ops.LTE
		}
	};
	exports.formatLimitDefinition = {
		keyword: Object.keys(KWDs),
		type: "string",
		schemaType: "string",
		$data: true,
		error: {
			message: ({ keyword, schemaCode }) => (0, codegen_1.str)`should be ${KWDs[keyword].okStr} ${schemaCode}`,
			params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
		},
		code(cxt) {
			const { gen, data, schemaCode, keyword, it } = cxt;
			const { opts, self } = it;
			if (!opts.validateFormats) return;
			const fCxt = new ajv_1.KeywordCxt(it, self.RULES.all.format.definition, "format");
			if (fCxt.$data) validate$DataFormat();
			else validateFormat();
			function validate$DataFormat() {
				const fmts = gen.scopeValue("formats", {
					ref: self.formats,
					code: opts.code.formats
				});
				const fmt = gen.const("fmt", (0, codegen_1._)`${fmts}[${fCxt.schemaCode}]`);
				cxt.fail$data((0, codegen_1.or)((0, codegen_1._)`typeof ${fmt} != "object"`, (0, codegen_1._)`${fmt} instanceof RegExp`, (0, codegen_1._)`typeof ${fmt}.compare != "function"`, compareCode(fmt)));
			}
			function validateFormat() {
				const format = fCxt.schema;
				const fmtDef = self.formats[format];
				if (!fmtDef || fmtDef === true) return;
				if (typeof fmtDef != "object" || fmtDef instanceof RegExp || typeof fmtDef.compare != "function") throw new Error(`"${keyword}": format "${format}" does not define "compare" function`);
				const fmt = gen.scopeValue("formats", {
					key: format,
					ref: fmtDef,
					code: opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(format)}` : void 0
				});
				cxt.fail$data(compareCode(fmt));
			}
			function compareCode(fmt) {
				return (0, codegen_1._)`${fmt}.compare(${data}, ${schemaCode}) ${KWDs[keyword].fail} 0`;
			}
		},
		dependencies: ["format"]
	};
	var formatLimitPlugin = (ajv) => {
		ajv.addKeyword(exports.formatLimitDefinition);
		return ajv;
	};
	exports.default = formatLimitPlugin;
}));
// node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.20.0/node_modules/ajv-formats/dist/index.js
var require_dist = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var formats_1 = require_formats();
	var limit_1 = require_limit();
	var codegen_1 = require_codegen();
	var fullName = new codegen_1.Name("fullFormats");
	var fastName = new codegen_1.Name("fastFormats");
	var formatsPlugin = (ajv, opts = { keywords: true }) => {
		if (Array.isArray(opts)) {
			addFormats(ajv, opts, formats_1.fullFormats, fullName);
			return ajv;
		}
		const [formats, exportName] = opts.mode === "fast" ? [formats_1.fastFormats, fastName] : [formats_1.fullFormats, fullName];
		addFormats(ajv, opts.formats || formats_1.formatNames, formats, exportName);
		if (opts.keywords) (0, limit_1.default)(ajv);
		return ajv;
	};
	formatsPlugin.get = (name, mode = "full") => {
		const f = (mode === "fast" ? formats_1.fastFormats : formats_1.fullFormats)[name];
		if (!f) throw new Error(`Unknown format "${name}"`);
		return f;
	};
	function addFormats(ajv, list, fs, exportName) {
		var _a;
		var _b;
		(_a = (_b = ajv.opts.code).formats) !== null && _a !== void 0 || (_b.formats = (0, codegen_1._)`require("ajv-formats/dist/formats").${exportName}`);
		for (const f of list) ajv.addFormat(f, fs[f]);
	}
	module.exports = exports = formatsPlugin;
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.default = formatsPlugin;
}));
// src/spec.ts
var import__2020 = require__2020();
var import_dist = /* @__PURE__ */ __toESM(require_dist(), 1);
var specDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "spec");
var SCHEMAS = [
	"factory-config",
	"workflow",
	"usage-record",
	"cost-footer"
];
var addFormats = import_dist.default.default;
function createValidators() {
	const ajv = new import__2020.Ajv2020({
		allErrors: true,
		strict: true,
		strictRequired: false,
		allowUnionTypes: true
	});
	addFormats(ajv);
	const validators = /* @__PURE__ */ new Map();
	for (const name of SCHEMAS) {
		const schema = JSON.parse(fs.readFileSync(path.join(specDir, `${name}.schema.json`), "utf8"));
		validators.set(name, ajv.compile(schema));
	}
	return validators;
}
var validators = createValidators();
function validate(schemaName, value) {
	const validator = validators.get(schemaName);
	if (!validator) throw new Error(`unknown schema ${schemaName}`);
	const valid = validator(value);
	const errors = valid ? [] : (validator.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`);
	if (valid && schemaName === "workflow") errors.push(...workflowGraphErrors(value));
	if (valid && schemaName === "factory-config") errors.push(...configRoleErrors(value));
	return {
		valid: errors.length === 0,
		errors
	};
}
function workflowGraphErrors(workflow) {
	const ids = new Set(workflow.nodes.map((n) => n.id));
	const errors = [];
	if (ids.size !== workflow.nodes.length) errors.push("node ids must be unique");
	if (!ids.has(workflow.entry)) errors.push(`entry '${workflow.entry}' is not a node`);
	const pairs = /* @__PURE__ */ new Set();
	for (const edge of workflow.edges) {
		if (!ids.has(edge.from)) errors.push(`edge from unknown node '${edge.from}'`);
		if (edge.to !== "END" && edge.to !== "FINISH" && !ids.has(edge.to)) errors.push(`edge to unknown node '${edge.to}'`);
		const pair = `${edge.from}->${edge.to}`;
		if (pairs.has(pair)) errors.push(`more than one edge ${pair}; merge their conditions into one edge`);
		pairs.add(pair);
	}
	if (!workflow.edges.some((e) => e.to === "END")) errors.push("no edge reaches END");
	return errors;
}
function configRoleErrors(config) {
	const tiers = new Set(config.tiers);
	return Object.entries(config.roles).filter(([, tier]) => !tiers.has(tier)).map(([role, tier]) => `role '${role}' uses unknown tier '${tier}'`);
}
// src/workflow-yaml.ts
mustache.escape = (text) => text;
var CONDITION = /^([a-zA-Z0-9_./-]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/;
function readPath(state, dotted) {
	let value = state;
	for (const key of dotted.split(".")) {
		if (value === null || typeof value !== "object" || !(key in value)) return void 0;
		value = value[key];
	}
	return value;
}
function literal(text) {
	const trimmed = text.trim();
	const quoted = trimmed.match(/^(["'])(.*)\1$/);
	if (quoted?.[2] !== void 0) return quoted[2];
	if (trimmed === "true" || trimmed === "false") return trimmed === "true";
	const number = Number(trimmed);
	if (Number.isNaN(number)) throw new Error(`condition value ${trimmed} is not a number, boolean or quoted string`);
	return number;
}
function evaluateWhen(when, state) {
	const match = when.trim().match(CONDITION);
	if (!match?.[1] || !match[2] || match[3] === void 0) throw new Error(`condition '${when}' must be '<state path> <operator> <value>'`);
	const raw = readPath(state, match[1]);
	if (raw === void 0) throw new Error(`condition '${when}': ${match[1]} is not set`);
	const left = Array.isArray(raw) ? raw.length : raw;
	const right = literal(match[3]);
	switch (match[2]) {
		case "==": return left === right;
		case "!=": return left !== right;
		case ">": return Number(left) > Number(right);
		case "<": return Number(left) < Number(right);
		case ">=": return Number(left) >= Number(right);
		default: return Number(left) <= Number(right);
	}
}
function agentsFromPath(dotted) {
	const statePath = dotted.replace(/^state\./, "");
	return (state) => {
		const agents = readPath(state ?? {}, statePath);
		if (!Array.isArray(agents)) throw new Error(`agentsFrom ${dotted} is not a list`);
		return agents;
	};
}
function render(template) {
	mustache.parse(template);
	return (context) => mustache.render(template, context);
}
function buildNode(workflow, spec) {
	if (spec.kind === "call") {
		const inputs = Object.fromEntries(Object.entries(spec.input ?? {}).map(([k, v]) => {
			mustache.parse(v);
			return [k, v];
		}));
		return {
			id: spec.id,
			path: `${workflow.name}/${spec.id}`,
			kind: "script",
			enterScope: {
				workflow: spec.workflow ?? "",
				input: inputs
			},
			...spec.maxVisits ? { maxVisits: spec.maxVisits } : {}
		};
	}
	if (spec.kind === "subgraph" || spec.kind === "map") throw new Error(`node ${spec.id}: ${spec.kind} ${spec.workflow ?? ""} is not expanded; load it with its workflow directory`);
	const node = {
		id: spec.id,
		path: `${workflow.name}/${spec.id}`,
		kind: spec.kind
	};
	if (spec.scope) node.scope = spec.scope;
	if (spec.localId) node.localId = spec.localId;
	if (spec.role) node.role = spec.role;
	if (spec.agent) node.agent = spec.agent;
	if (spec.skill) node.agent = spec.skill;
	if (spec.tools) node.tools = spec.tools;
	if (spec.dirs) {
		const dirs = spec.dirs.map(render);
		node.dirs = (context) => dirs.map((dir) => dir(context)).filter(Boolean);
	}
	if (spec.agents) node.agents = spec.agents.map((a) => ({
		id: a.id,
		...a.role ? { role: a.role } : {},
		...a.agent ? { agentName: a.agent } : {}
	}));
	if (spec.question) node.question = spec.question;
	if (spec.turns) node.turns = spec.turns;
	if (spec.askAfterTurn) node.askAfterTurn = spec.askAfterTurn;
	if (spec.maxVisits) node.maxVisits = spec.maxVisits;
	if (spec.parallel) node.parallel = spec.parallel;
	if (spec.prompt) node.prompt = render(spec.prompt);
	if (spec.agentsFrom) node.agentsFrom = agentsFromPath(spec.agentsFrom);
	if (spec.parse) {
		const parser = PARSERS[spec.parse];
		if (!parser) throw new Error(`node ${spec.id}: unknown parser ${spec.parse}`);
		node.parse = parser;
	}
	if (spec.op) {
		const operation = OPERATIONS[spec.op];
		if (!operation) throw new Error(`node ${spec.id}: unknown operation ${spec.op}`);
		const args = spec.with ?? {};
		node.script = (context) => operation({
			...context,
			args
		});
	}
	return node;
}
function readSpec(file) {
	let spec;
	try {
		spec = (0, import_dist$1.parse)(fs.readFileSync(file, "utf8"));
	} catch (error) {
		if (error instanceof import_dist$1.YAMLParseError) throw new Error(`${file}: invalid YAML: ${error.message}`);
		throw error;
	}
	const result = validate("workflow", spec);
	if (!result.valid) throw new Error(`${file}: ${result.errors.join("; ")}`);
	for (const node of spec.nodes) {
		if (node.kind === "llm" && node.role && !(spec.roles ?? {})[node.role]) throw new Error(`${file}: node ${node.id}: role ${node.role} has no tier in roles`);
		for (const agent of node.agents ?? []) if (agent.role && !(spec.roles ?? {})[agent.role]) throw new Error(`${file}: node ${node.id}: role ${agent.role} has no tier in roles`);
	}
	return spec;
}
function negateWhen(when) {
	const match = when.match(/^(\S+)\s*(==|!=)\s*(.+)$/);
	if (!match) throw new Error(`enabledWhen '${when}' must use == or !=`);
	return `${match[1]} ${match[2] === "==" ? "!=" : "=="} ${match[3]}`;
}
function expandSubgraphs(spec, specs, seen = []) {
	if (seen.includes(spec.name)) throw new Error(`subgraph cycle: ${[...seen, spec.name].join(" -> ")}`);
	let nodes = [];
	let edges = [...spec.edges];
	let entry = spec.entry;
	const roles = { ...spec.roles ?? {} };
	for (const node of spec.nodes) {
		if (node.kind !== "subgraph" && node.kind !== "call" && node.kind !== "group") {
			nodes.push(node);
			continue;
		}
		if (node.kind === "group") {
			const groupSpec = node.workflow ? specs.get(node.workflow) : void 0;
			if (!groupSpec) throw new Error(`node ${node.id}: unknown group workflow ${node.workflow}`);
			const group = expandSubgraphs(groupSpec, specs, [...seen, spec.name]);
			const clash = group.nodes.find((n) => spec.nodes.some((o) => o.id === n.id) || nodes.some((o) => o.id === n.id));
			if (clash) throw new Error(`group ${node.id}: node id ${clash.id} is used twice; a group keeps its node ids`);
			nodes = nodes.concat(group.nodes);
			for (const [role, tier] of Object.entries(group.roles ?? {})) roles[role] ??= tier;
			const exits = edges.filter((e) => e.from === node.id);
			const inner = group.edges.flatMap((e) => {
				if (e.to !== "END") return [e];
				return exits.map((x) => {
					if (e.when && x.when) throw new Error(`group ${node.id}: both the inner edge from ${e.from} and the outer edge to ${x.to} have a condition`);
					const when = e.when ?? x.when;
					return {
						from: e.from,
						to: x.to,
						...when ? { when } : {}
					};
				});
			});
			edges = edges.filter((e) => e.from !== node.id).map((e) => e.to === node.id ? {
				...e,
				to: group.entry
			} : e).concat(inner);
			if (entry === node.id) entry = group.entry;
			continue;
		}
		const subSpec = node.workflow ? specs.get(node.workflow) : void 0;
		if (!subSpec) throw new Error(`node ${node.id}: unknown subgraph workflow ${node.workflow}`);
		const sub = expandSubgraphs(subSpec, specs, [...seen, spec.name]);
		const prefix = (id) => `${node.id}/${id}`;
		const scoped = node.kind === "call";
		nodes = nodes.concat(sub.nodes.map((n) => ({
			...n,
			id: prefix(n.id),
			...scoped ? {
				scope: n.scope ? prefix(n.scope) : node.id,
				localId: n.localId ?? n.id
			} : {}
		})));
		for (const [role, tier] of Object.entries(sub.roles ?? {})) roles[role] ??= tier;
		const exits = edges.filter((e) => e.from === node.id);
		if (node.enabledWhen) {
			if (exits.some((x) => x.when)) throw new Error(`subgraph ${node.id}: a switched subgraph (enabledWhen) needs exits without conditions`);
			nodes.push({
				id: node.id,
				kind: "script",
				op: "builtin.gate",
				with: {
					subgraph: node.workflow,
					when: node.enabledWhen
				}
			});
		}
		const inner = sub.edges.flatMap((e) => {
			if (e.to === "FINISH" && !scoped) return [{
				...e,
				from: prefix(e.from)
			}];
			if (e.to !== "END" && e.to !== "FINISH") return [{
				...e,
				from: prefix(e.from),
				to: prefix(e.to)
			}];
			return exits.map((x) => {
				if (e.when && x.when) throw new Error(`subgraph ${node.id}: both the inner edge and the outer edge have a condition`);
				const when = e.when ?? x.when;
				return {
					from: prefix(e.from),
					to: x.to,
					...when ? { when } : {}
				};
			});
		});
		if (scoped) {
			if (exits.some((x) => x.when)) throw new Error(`call ${node.id}: its exits need no condition`);
			nodes.push({
				id: node.id,
				kind: "call",
				workflow: node.workflow,
				input: node.input ?? {},
				...node.maxVisits ? { maxVisits: node.maxVisits } : {}
			});
			edges = edges.filter((e) => e.from !== node.id).concat([{
				from: node.id,
				to: prefix(sub.entry)
			}], inner);
			continue;
		}
		if (node.enabledWhen) {
			const gate = [{
				from: node.id,
				to: prefix(sub.entry),
				when: node.enabledWhen
			}, ...exits.map((x) => ({
				from: node.id,
				to: x.to,
				when: negateWhen(node.enabledWhen)
			}))];
			edges = edges.filter((e) => e.from !== node.id).concat(gate, inner);
			continue;
		}
		edges = edges.filter((e) => e.from !== node.id).map((e) => e.to === node.id ? {
			...e,
			to: prefix(sub.entry)
		} : e).concat(inner);
		if (entry === node.id) entry = prefix(sub.entry);
	}
	return {
		...spec,
		roles,
		entry,
		nodes,
		edges
	};
}
function buildWorkflow(spec, file) {
	let nodes;
	try {
		nodes = spec.nodes.map((n) => buildNode(spec, n));
	} catch (error) {
		throw new Error(`${file}: ${error.message}`);
	}
	return {
		name: spec.name,
		version: spec.version,
		entry: spec.entry,
		nodes,
		edges: spec.edges.map((e) => e.to === "FINISH" ? {
			...e,
			to: "END"
		} : e),
		maxCycleIterations: spec.limits?.maxCycleIterations ?? 3,
		...spec.source ? { source: spec.source } : {},
		...spec.roles ? { roles: spec.roles } : {}
	};
}
function loadWorkflowDir(dir) {
	const specs = /* @__PURE__ */ new Map();
	const files = /* @__PURE__ */ new Map();
	for (const file of fs.readdirSync(dir).filter((f) => /.ya?ml$/.test(f)).sort()) {
		const full = path.join(dir, file);
		const spec = readSpec(full);
		if (specs.has(spec.name)) throw new Error(`${file}: workflow name ${spec.name} is used twice`);
		specs.set(spec.name, spec);
		files.set(spec.name, full);
	}
	const workflows = /* @__PURE__ */ new Map();
	for (const [name, spec] of specs) workflows.set(name, buildWorkflow(expandSubgraphs(spec, specs), files.get(name) ?? name));
	return workflows;
}
function loadWorkflowSpecs(dir) {
	return fs.readdirSync(dir).filter((f) => /.ya?ml$/.test(f)).sort().map((f) => readSpec(path.join(dir, f)));
}
// src/config.ts
function configFile() {
	return process.env.FACTORY_CONFIG ?? path.join(FACTORY_DIR, "config", "factory.yaml");
}
function loadFactoryConfig(file = configFile()) {
	const raw = (0, import_dist$1.parse)(fs.readFileSync(file, "utf8"));
	const result = validate("factory-config", raw);
	if (!result.valid) throw new Error(`${file}: ${result.errors.join("; ")}`);
	return {
		roles: raw.roles,
		budget: {
			maxCostUsd: raw.budget.maxCostUsd,
			infoRatio: raw.budget.infoRatio ?? .5,
			pauseRatio: raw.budget.pauseRatio ?? .8
		},
		switches: raw.switches ?? {}
	};
}
// src/engine.ts
var FAKE_PRICE_PER_MTOK = {
	low: {
		input: .8,
		output: 4
	},
	medium: {
		input: 3,
		output: 15
	},
	high: {
		input: 15,
		output: 75
	}
};
var PARALLEL_AGENTS = 10;
function workspace(run) {
	return run.workspace ?? run.input?.project ?? run.input?.cwd ?? process.env.FACTORY_WORKSPACE ?? process.cwd();
}
function defaultConfig(kind, cli) {
	const file = loadFactoryConfig();
	const tiers = kind === "fake" ? {
		low: "fake-low",
		medium: "fake-medium",
		high: "fake-high"
	} : {
		low: "claude-haiku-5-5",
		medium: "claude-haiku-5-5",
		high: "claude-haiku-5-5"
	};
	const backend = kind === "cli" ? {
		kind: "cli",
		cli
	} : { kind };
	return {
		roles: file.roles,
		tiers,
		backend,
		budget: file.budget
	};
}
function processAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error.code === "EPERM";
	}
}
function ownedByOtherProcess(run) {
	return run.ownerPid !== void 0 && run.ownerPid !== process.pid && processAlive(run.ownerPid);
}
function parseBackend(value) {
	const backend = value ?? "delegate";
	if (backend !== "fake" && backend !== "delegate" && backend !== "cli") throw new Error("FACTORY_BACKEND must be fake, delegate or cli");
	return backend;
}
function parseCli(value) {
	if (value !== "claude" && value !== "opencode") throw new Error("FACTORY_CLI must be claude or opencode");
	return value;
}
var workflows;
function workflowsDir() {
	return process.env.FACTORY_WORKFLOWS_DIR ?? path.join(FACTORY_DIR, "workflows");
}
function loadedWorkflows() {
	workflows ??= loadWorkflowDir(workflowsDir());
	return workflows;
}
function workflowOf(run) {
	const workflow = loadedWorkflows().get(run.workflow ?? "hello");
	if (!workflow) throw new Error(`unknown workflow ${run.workflow}`);
	return workflow;
}
function workflowLabel(run) {
	const workflow = workflowOf(run);
	return `${workflow.name}@${workflow.version}`;
}
var TURN_DELAY_MS = Number(process.env.FACTORY_TURN_DELAY_MS ?? 40);
function fakeModelTurn(tier, turn, agentIndex = 0) {
	const inputTokens = 3e3 + turn * 1500 + agentIndex * 700;
	const outputTokens = 300 + turn * 50;
	const price = FAKE_PRICE_PER_MTOK[tier];
	return {
		inputTokens,
		outputTokens,
		costUsd: (inputTokens * price.input + outputTokens * price.output) / 1e6
	};
}
var Factory = class {
	dataDir;
	executors;
	defaultConfig;
	runs = /* @__PURE__ */ new Map();
	idempotency = /* @__PURE__ */ new Map();
	timers = /* @__PURE__ */ new Map();
	busy = /* @__PURE__ */ new Set();
	waiters = /* @__PURE__ */ new Map();
	constructor(dataDir, { executors = {}, backend = "delegate", cli } = {}) {
		this.dataDir = dataDir;
		this.executors = executors;
		if (backend === "cli" && !(cli && executors[cli])) throw new Error("the cli backend needs a cli name and its executor");
		this.defaultConfig = defaultConfig(backend, cli);
		fs.mkdirSync(path.join(dataDir, "runs"), { recursive: true });
		this.restore();
	}
	restore() {
		const dir = path.join(this.dataDir, "runs");
		for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
			const run = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
			this.runs.set(run.runId, run);
			if (run.idempotencyKey) this.idempotency.set(run.idempotencyKey, run.runId);
			if (run.status === "running" && !ownedByOtherProcess(run)) this.schedule(run);
		}
	}
	checkpoint(run) {
		const file = path.join(this.dataDir, "runs", `${run.runId}.json`);
		const temp = `${file}.${process.pid}.tmp`;
		fs.writeFileSync(temp, JSON.stringify(run, null, 2));
		fs.renameSync(temp, file);
		if (run.status !== "running") this.notify(run);
	}
	notify(run) {
		const waiting = this.waiters.get(run.runId);
		if (!waiting) return;
		this.waiters.delete(run.runId);
		for (const resolve of waiting) resolve(run);
	}
	waitForChange(runId, timeoutMs) {
		const run = this.get(runId);
		if (run.status !== "running") return Promise.resolve({
			run,
			timedOut: false
		});
		return new Promise((resolve) => {
			const done = (r) => {
				clearTimeout(timer);
				resolve({
					run: r,
					timedOut: false
				});
			};
			const timer = setTimeout(() => {
				this.waiters.get(runId)?.delete(done);
				resolve({
					run,
					timedOut: true
				});
			}, timeoutMs);
			let waiting = this.waiters.get(runId);
			if (!waiting) {
				waiting = /* @__PURE__ */ new Set();
				this.waiters.set(runId, waiting);
			}
			waiting.add(done);
		});
	}
	appendLedger(run, record) {
		const entry = {
			runId: run.runId,
			workflow: workflowLabel(run),
			at: (/* @__PURE__ */ new Date()).toISOString(),
			...record
		};
		run.ledger.push(entry);
		fs.appendFileSync(path.join(this.dataDir, "ledger.jsonl"), JSON.stringify(entry) + "\n");
		this.event(run, "ledger_record", {
			node: record.nodePath,
			costUsd: record.costUsd,
			costSource: record.costSource
		});
	}
	event(run, type, data = {}) {
		run.events.push({
			at: (/* @__PURE__ */ new Date()).toISOString(),
			type,
			...data
		});
	}
	get(runId) {
		const run = this.runs.get(runId);
		if (!run) throw new Error(`unknown runId ${runId}`);
		return run;
	}
	start(goal, idempotencyKey, { workflow = "hello", input = {} } = {}) {
		const definition = loadedWorkflows().get(workflow);
		if (!definition) throw new Error(`unknown workflow ${workflow}`);
		const existing = idempotencyKey ? this.idempotency.get(idempotencyKey) : void 0;
		if (existing) return {
			run: this.get(existing),
			reused: true
		};
		const defaults = structuredClone(this.defaultConfig);
		const run = {
			runId: `r-${crypto.randomUUID().slice(0, 8)}`,
			idempotencyKey: idempotencyKey ?? null,
			goal,
			workflow,
			input: {
				...input,
				switches: {
					...loadFactoryConfig().switches,
					...input.switches ?? {}
				}
			},
			state: {},
			nodeAgents: {},
			status: "needs_confirmation",
			proposal: {
				...defaults,
				roles: Object.fromEntries(Object.entries(definition.roles ?? {}).map(([role, tier]) => [role, defaults.roles[role] ?? tier]))
			},
			config: null,
			cursor: definition.nodes.findIndex((n) => n.id === definition.entry),
			visits: { [definition.entry]: 1 },
			nodeTurn: 0,
			steps: 0,
			pendingQuestion: null,
			pendingWork: null,
			answers: {},
			ledger: [],
			events: [],
			thresholdsHit: []
		};
		this.runs.set(run.runId, run);
		if (idempotencyKey) this.idempotency.set(idempotencyKey, run.runId);
		this.event(run, "run_created", { goal });
		this.checkpoint(run);
		return {
			run,
			reused: false
		};
	}
	confirm(runId, overrides = {}) {
		const run = this.get(runId);
		if (run.status !== "needs_confirmation") return run;
		const backend = {
			...run.proposal.backend,
			...overrides.backend ?? {}
		};
		if (backend.kind === "cli" && !(backend.cli && this.executors[backend.cli])) throw new Error(`no executor for cli backend '${backend.cli}' in this factory process`);
		run.config = {
			...run.proposal,
			backend,
			roles: {
				...run.proposal.roles,
				...overrides.roles ?? {}
			},
			tiers: {
				...run.proposal.tiers,
				...overrides.tierModels ?? {}
			},
			budget: {
				...run.proposal.budget,
				...overrides.budget ?? {}
			}
		};
		run.status = "running";
		this.event(run, "run_confirmed", { config: run.config });
		this.checkpoint(run);
		this.schedule(run);
		return run;
	}
	answer(runId, questionId, answer) {
		const run = this.get(runId);
		if (run.answers[questionId] !== void 0) {
			if (run.answers[questionId] === answer) return {
				run,
				duplicate: true
			};
			throw new Error(`question ${questionId} already answered with a different value`);
		}
		const pending = run.pendingQuestion;
		if (!pending || pending.id !== questionId) throw new Error(`no pending question ${questionId}`);
		if (pending.allowed && !pending.allowed.includes(answer)) throw new Error(`invalid answer '${answer}', allowed: ${pending.allowed.join(", ")}`);
		run.answers[questionId] = answer;
		run.pendingQuestion = null;
		run.status = "running";
		this.event(run, "run_resumed", {
			questionId,
			answer
		});
		this.checkpoint(run);
		this.schedule(run);
		return {
			run,
			duplicate: false
		};
	}
	next(runId) {
		const run = this.get(runId);
		return run.status === "waiting_for_client" ? run.pendingWork : null;
	}
	submit(runId, nodePath, output, usage = {}, agentId = void 0) {
		const run = this.get(runId);
		const items = run.pendingWorkItems ?? (run.pendingWork ? [run.pendingWork] : []);
		const work = items.find((w) => w.nodePath === nodePath && (!agentId || w.agentId === agentId));
		if (run.status !== "waiting_for_client" || !work) {
			if (run.ledger.find((r) => r.nodePath === nodePath && r.backend === "delegate" && (!agentId || r.agentId === agentId))) return {
				run,
				duplicate: true
			};
			throw new Error(`no pending work for node ${nodePath}`);
		}
		const inputTokens = Number.isInteger(usage.inputTokens) ? usage.inputTokens : void 0;
		const outputTokens = Number.isInteger(usage.outputTokens) ? usage.outputTokens : void 0;
		const hasSplit = inputTokens !== void 0 && outputTokens !== void 0;
		const tokens = {
			input: hasSplit ? inputTokens : null,
			output: hasSplit ? outputTokens : null,
			cacheRead: usage.cacheReadTokens ?? 0,
			cacheWrite5m: usage.cacheWriteTokens ?? 0,
			cacheWrite1h: 0
		};
		const priced = hasSplit ? priceUsage(usage.model ?? work.model, tokens, false) : {
			costUsd: null,
			costSource: "unknown"
		};
		run.steps += 1;
		this.appendLedger(run, {
			nodePath,
			agentId: work.agentId,
			kind: "llm",
			tier: work.tier,
			model: usage.model ?? work.model,
			backend: "delegate",
			turn: 1,
			inputTokens: tokens.input,
			outputTokens: tokens.output,
			cacheReadTokens: tokens.cacheRead,
			cacheWrite5mTokens: tokens.cacheWrite5m,
			cacheWrite1hTokens: 0,
			totalTokens: usage.totalTokens ?? null,
			childSessionId: usage.childSessionId ?? null,
			costUsd: priced.costUsd,
			costSource: hasSplit ? "reported" : "unknown",
			outputPreview: String(output ?? "").slice(0, 200),
			agentName: work.agentName ?? null
		});
		const node = nodeAt(run);
		this.storeParsed(run, node, work.agentId, output);
		this.event(run, "agent_completed", {
			node: node.path,
			agentId: work.agentId,
			backend: "delegate"
		});
		const left = items.filter((w) => w !== work);
		run.pendingWorkItems = left;
		run.pendingWork = left[0] ?? null;
		if (left.length === 0) {
			run.status = "running";
			this.event(run, "node_completed", {
				node: node.path,
				backend: "delegate"
			});
			this.advance(run, node);
		}
		this.checkpoint(run);
		this.schedule(run);
		return {
			run,
			duplicate: false
		};
	}
	enrichLedger(runId, index, usage) {
		const run = this.get(runId);
		const record = run.ledger[index];
		if (!record) throw new Error(`no ledger record ${index} in run ${runId}`);
		const priced = priceUsage(record.model, usage.tokens, usage.cacheWriteTtlKnown);
		Object.assign(record, {
			inputTokens: usage.tokens.input,
			outputTokens: usage.tokens.output,
			cacheReadTokens: usage.tokens.cacheRead,
			cacheWrite5mTokens: usage.tokens.cacheWrite5m,
			costUsd: priced.costUsd,
			costSource: priced.costSource,
			enrichedFrom: "child-session"
		});
		this.checkpoint(run);
	}
	cancel(runId) {
		const run = this.get(runId);
		if (![
			"done",
			"stopped",
			"failed"
		].includes(run.status)) {
			run.status = "cancelled";
			this.event(run, "run_cancelled");
			this.checkpoint(run);
		}
		return run;
	}
	schedule(run) {
		if (this.timers.has(run.runId) || this.busy.has(run.runId)) return;
		run.ownerPid = process.pid;
		const tick = async () => {
			this.timers.delete(run.runId);
			if (run.status !== "running") return;
			this.busy.add(run.runId);
			try {
				await this.step(run);
			} catch (error) {
				run.status = "failed";
				this.event(run, "run_failed", { error: errorMessage(error) });
			} finally {
				this.busy.delete(run.runId);
			}
			this.checkpoint(run);
			if (run.status === "running") this.timers.set(run.runId, setTimeout(tick, TURN_DELAY_MS));
		};
		this.timers.set(run.runId, setTimeout(tick, TURN_DELAY_MS));
	}
	totals(run) {
		return {
			costUsd: run.ledger.reduce((s, r) => s + (r.costUsd ?? 0), 0),
			tokens: run.ledger.reduce((s, r) => s + (r.inputTokens ?? 0) + (r.outputTokens ?? 0) + (r.inputTokens == null ? r.totalTokens ?? 0 : 0), 0),
			steps: run.steps
		};
	}
	checkBudget(run) {
		const { maxCostUsd, infoRatio, pauseRatio } = configOf(run).budget;
		const ratio = this.totals(run).costUsd / maxCostUsd;
		if (ratio >= 1) {
			run.status = "stopped";
			this.event(run, "budget_exceeded", { ratio });
			return false;
		}
		if (ratio >= infoRatio && !run.thresholdsHit.includes("info")) {
			run.thresholdsHit.push("info");
			this.event(run, "budget_threshold", {
				level: "info",
				ratio
			});
		}
		if (ratio >= pauseRatio && !run.thresholdsHit.includes("pause")) {
			run.thresholdsHit.push("pause");
			run.status = "waiting_for_user";
			run.pendingQuestion = {
				id: "q-budget-pause",
				text: `The factory run has used ${Math.round(ratio * 100)}% of its budget. Continue or stop?`,
				allowed: ["continue", "stop"]
			};
			this.event(run, "budget_threshold", {
				level: "pause",
				ratio
			});
			return false;
		}
		return true;
	}
	nodeAgents(run, node) {
		const agents = agentsOf(run, node);
		if (!agents) return [{
			id: node.localId ?? node.id,
			role: node.role,
			agentName: node.agent
		}];
		return agents.map((a) => ({
			...a,
			role: a.role ?? node.role,
			agentName: a.agentName ?? node.agent
		}));
	}
	view(run, node) {
		if (!node.scope) return {
			state: run.state ??= {},
			input: run.input ?? {},
			answers: run.answers,
			prefix: "",
			key: node.id
		};
		const scope = run.scopes?.[node.scope];
		if (!scope) throw new Error(`node ${node.path} runs before its call ${node.scope} entered`);
		const prefix = `${node.scope}#${scope.iteration}:`;
		const answers = Object.fromEntries(Object.entries(run.answers).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
		run.state ??= {};
		return {
			state: run.state[node.scope] ?? (run.state[node.scope] = {}),
			input: scope.input,
			answers,
			prefix,
			key: node.localId ?? node.id
		};
	}
	enterScope(run, node) {
		const spec = node.enterScope;
		const parent = this.view(run, {
			...node,
			scope: void 0
		});
		const context = {
			goal: run.goal,
			input: run.input,
			state: parent.state
		};
		const input = {
			...run.input ?? {},
			...Object.fromEntries(Object.entries(spec.input).map(([k, v]) => [k, mustache.render(v, context)]))
		};
		run.scopes ??= {};
		const iteration = (run.scopes[node.id]?.iteration ?? 0) + 1;
		run.scopes[node.id] = {
			iteration,
			input
		};
		run.state ??= {};
		run.state[node.id] = {};
		const inner = `${node.id}/`;
		for (const k of Object.keys(run.visits ?? {})) if (k.startsWith(inner)) delete run.visits[k];
		for (const k of Object.keys(run.nodeAgents ?? {})) if (k.startsWith(inner)) delete run.nodeAgents[k];
		this.event(run, "node_completed", {
			node: node.path,
			result: `call ${spec.workflow} #${iteration}`,
			input: Object.keys(spec.input)
		});
	}
	prompt(run, node, agent = currentAgent(run, node)) {
		if (!node.prompt) throw new Error(`node ${node.path} has no prompt`);
		const view = this.view(run, node);
		return node.prompt({
			goal: run.goal,
			input: view.input,
			state: view.state,
			agent,
			answer: (node.question && view.answers[node.question.id]) ?? "",
			steps: run.steps
		});
	}
	dirs(run, node, agent) {
		const marketplace = agent.agentName ? readMarketplaceAgent(agent.agentName).dirs : [];
		const view = this.view(run, node);
		const listed = node.dirs?.({
			goal: run.goal,
			input: view.input,
			state: view.state,
			agent
		}) ?? [];
		return [.../* @__PURE__ */ new Set([...listed, ...marketplace])];
	}
	storeParsed(run, node, agentId, output) {
		if (!node.parse) return;
		const { state, key } = this.view(run, node);
		const previous = state[key];
		state[key] = {
			...typeof previous === "object" && previous !== null ? previous : {},
			[agentId]: node.parse(output ?? "")
		};
	}
	advance(run, node) {
		const workflow = workflowOf(run);
		const view = this.view(run, node);
		const context = {
			...view.state,
			answers: view.answers,
			input: view.input,
			switches: run.input?.switches ?? {}
		};
		const edge = workflow.edges.filter((e) => e.from === node.id).find((e) => e.when === void 0 || evaluateWhen(e.when, context));
		if (!edge) throw new Error(`no edge from ${node.id} matches the run state`);
		run.nodeTurn = 0;
		run.agentIndex = 0;
		this.event(run, "edge_taken", {
			from: node.id,
			to: edge.to,
			...edge.when ? { when: edge.when } : {}
		});
		if (edge.to === "END") {
			run.cursor = -1;
			return;
		}
		run.visits ??= {};
		const visits = (run.visits[edge.to] ?? 0) + 1;
		const limit = workflow.nodes.find((n) => n.id === edge.to)?.maxVisits ?? workflow.maxCycleIterations;
		if (visits > limit) throw new Error(`node ${edge.to} would run ${visits} times; the workflow allows ${limit}`);
		run.visits[edge.to] = visits;
		if (run.nodeAgents) delete run.nodeAgents[edge.to];
		run.cursor = workflow.nodes.findIndex((n) => n.id === edge.to);
	}
	async step(run) {
		if (run.answers["q-budget-pause"] === "stop") {
			run.status = "stopped";
			return;
		}
		if (!this.checkBudget(run)) return;
		const node = run.cursor < 0 ? void 0 : workflowOf(run).nodes[run.cursor];
		if (!node) {
			run.status = "done";
			this.event(run, "run_completed", this.totals(run));
			return;
		}
		const visit = run.visits?.[node.id] ?? 1;
		if (run.nodeTurn === 0 && !run.events.some((e) => e.type === "node_started" && e.node === node.path && e.visit === visit)) this.event(run, "node_started", {
			node: node.path,
			visit
		});
		if (node.kind === "interrupt") {
			if (!node.question) throw new Error(`interrupt node ${node.path} has no question`);
			const view = this.view(run, node);
			const context = {
				goal: run.goal,
				input: view.input,
				state: view.state
			};
			const { allowedFrom, ...fixed } = node.question;
			const question = {
				...fixed,
				id: view.prefix + mustache.render(node.question.id, context),
				text: mustache.render(node.question.text, context),
				...allowedFrom ? { allowed: allowedOf(view.state, allowedFrom) } : {}
			};
			const answer = run.answers[question.id];
			if (answer === void 0) {
				run.status = "waiting_for_user";
				run.pendingQuestion = {
					...question,
					node: node.path
				};
				this.event(run, "needs_input", {
					node: node.path,
					questionId: question.id
				});
				return;
			}
			view.state[view.key] = { answer };
			this.event(run, "node_completed", {
				node: node.path,
				answer
			});
			this.advance(run, node);
			return;
		}
		if (node.kind === "script") {
			run.steps += 1;
			const started = Date.now();
			if (node.enterScope) {
				this.enterScope(run, node);
				this.advance(run, node);
				return;
			}
			if (!node.script) throw new Error(`script node ${node.path} has no operation`);
			const view = this.view(run, node);
			const result = await node.script({
				input: view.input,
				state: view.state,
				exec: this.executors.exec,
				goal: run.goal,
				answers: view.answers,
				cwd: workspace(run),
				nodeId: view.key
			});
			view.state[view.key] = result.state;
			if (result.workspace && result.workspace !== run.workspace) {
				run.workspace = result.workspace;
				this.event(run, "workspace_changed", {
					node: node.path,
					workspace: result.workspace
				});
			}
			this.appendLedger(run, {
				nodePath: node.path,
				agentId: node.id,
				kind: "script",
				tier: null,
				model: null,
				backend: "script",
				turn: 1,
				inputTokens: 0,
				outputTokens: 0,
				costUsd: 0,
				costSource: "measured",
				durationMs: Date.now() - started,
				output: result.output ?? null
			});
			this.event(run, "node_completed", {
				node: node.path,
				result: (String(result.output ?? "").split(/\r?\n/)[0] ?? "").slice(0, 200),
				...result.metrics ? { metrics: result.metrics } : {}
			});
			this.advance(run, node);
			return;
		}
		const config = configOf(run);
		const backend = config.backend.kind;
		const askNow = backend === "fake" ? run.nodeTurn === node.askAfterTurn : true;
		if (node.question && askNow && run.answers[node.question.id] === void 0) {
			run.status = "waiting_for_user";
			run.pendingQuestion = {
				...node.question,
				node: node.path
			};
			this.event(run, "needs_input", {
				node: node.path,
				questionId: node.question.id
			});
			return;
		}
		if (node.agentsFrom && run.nodeAgents?.[node.id] === void 0) {
			run.nodeAgents ??= {};
			const selected = node.agentsFrom(this.view(run, node).state);
			run.nodeAgents[node.id] = selected;
			this.event(run, "agents_selected", {
				node: node.path,
				agents: selected.map((a) => a.id)
			});
		}
		if (agentsOf(run, node)?.length === 0 || node.skipIf?.(this.view(run, node).state)) {
			this.event(run, "node_skipped", {
				node: node.path,
				reason: node.skipReason ?? "no work"
			});
			this.advance(run, node);
			return;
		}
		if (backend === "cli") return this.runCliNode(run, node);
		if (backend === "delegate") {
			const items = this.nodeAgents(run, node).map((agent) => {
				const tier = tierOf(config, agent);
				const definition = agent.agentName ? readMarketplaceAgent(agent.agentName) : void 0;
				return {
					nodePath: node.path,
					agentId: agent.id,
					tier,
					model: config.tiers[tier],
					prompt: this.prompt(run, node, agent),
					...definition ? {
						agentName: definition.name,
						agentDescription: definition.description,
						agentInstructions: definition.prompt
					} : {},
					tools: node.tools ?? ["read"],
					dirs: this.dirs(run, node, agent),
					...run.workspace ? { cwd: run.workspace } : {}
				};
			});
			run.pendingWorkItems = items;
			run.pendingWork = items[0] ?? null;
			run.status = "waiting_for_client";
			for (const item of items) this.event(run, "work_offered", {
				node: node.path,
				agentId: item.agentId,
				tier: item.tier
			});
			return;
		}
		const agent = currentAgent(run, node);
		const tier = tierOf(config, agent);
		const turn = run.nodeTurn + 1;
		const usage = fakeModelTurn(tier, turn, run.agentIndex ?? 0);
		run.steps += 1;
		run.nodeTurn = turn;
		this.appendLedger(run, {
			nodePath: node.path,
			agentId: agent.id,
			kind: "llm",
			tier,
			model: config.tiers[tier],
			backend: "fake",
			turn,
			...usage,
			costSource: "measured"
		});
		if (node.turns !== void 0 && turn >= node.turns) this.finishAgent(run, node, { turns: turn });
	}
	finishAgent(run, node, details) {
		const agent = currentAgent(run, node);
		const agents = agentsOf(run, node);
		if (agents) this.event(run, "agent_completed", {
			node: node.path,
			agentId: agent.id,
			...details
		});
		run.nodeTurn = 0;
		if (agents && (run.agentIndex ?? 0) + 1 < agents.length) {
			run.agentIndex = (run.agentIndex ?? 0) + 1;
			return;
		}
		this.event(run, "node_completed", {
			node: node.path,
			...details
		});
		this.advance(run, node);
	}
	async runCliNode(run, node) {
		const config = configOf(run);
		const { cli } = config.backend;
		const executor = cli ? this.executors[cli] : void 0;
		if (!executor) throw new Error(`no executor for cli backend '${cli}' in this factory process`);
		const agents = this.nodeAgents(run, node);
		const limit = node.parallel ?? PARALLEL_AGENTS;
		const failures = [];
		for (let i = 0; i < agents.length; i += limit) await Promise.all(agents.slice(i, i + limit).map(async (agent) => {
			const tier = tierOf(config, agent);
			const model = config.tiers[tier];
			this.event(run, "agent_started", {
				node: node.path,
				agentId: agent.id,
				tier
			});
			this.checkpoint(run);
			const result = await executor({
				model,
				prompt: this.prompt(run, node, agent),
				agent: agent.agentName,
				cwd: workspace(run),
				configDir: run.input?.agentConfigDir,
				tools: node.tools ?? ["read"],
				dirs: this.dirs(run, node, agent)
			});
			run.steps += 1;
			if (!result.ok) {
				failures.push(`${agent.id}: ${result.error}`);
				this.event(run, "agent_failed", {
					node: node.path,
					agentId: agent.id,
					error: result.error
				});
				return;
			}
			for (const u of result.usageByModel ?? []) {
				const priced = priceUsage(u.model, u.tokens, u.cacheWriteTtlKnown);
				this.appendLedger(run, {
					nodePath: node.path,
					agentId: agent.id,
					kind: "llm",
					tier,
					model: u.model,
					requestedModel: model,
					backend: `cli:${cli}`,
					turn: 1,
					harnessTurns: result.turns,
					inputTokens: u.tokens.input,
					outputTokens: u.tokens.output,
					cacheReadTokens: u.tokens.cacheRead,
					cacheWrite5mTokens: u.tokens.cacheWrite5m,
					cacheWrite1hTokens: u.tokens.cacheWrite1h,
					costUsd: priced.costUsd,
					costSource: priced.costSource,
					harnessCostUsd: u.harnessCostUsd,
					durationMs: result.durationMs,
					outputPreview: String(result.text ?? "").slice(0, 200),
					output: result.text ?? null,
					agentName: agent.agentName ?? null
				});
			}
			this.storeParsed(run, node, agent.id, result.text ?? "");
			this.event(run, "agent_completed", {
				node: node.path,
				agentId: agent.id,
				backend: `cli:${cli}`
			});
			this.checkpoint(run);
		}));
		if (failures.length) {
			run.status = "failed";
			this.event(run, "node_failed", {
				node: node.path,
				error: failures.join("; ")
			});
			return;
		}
		this.event(run, "node_completed", {
			node: node.path,
			backend: `cli:${cli}`
		});
		this.advance(run, node);
	}
	footer(run) {
		const t = this.totals(run);
		const max = run.config?.budget.maxCostUsd ?? run.proposal.budget.maxCostUsd;
		const perNode = {};
		for (const r of run.ledger) perNode[r.nodePath] = round((perNode[r.nodePath] ?? 0) + (r.costUsd ?? 0));
		return {
			costUsd: round(t.costUsd),
			budgetUsd: max,
			budgetRatio: round(t.costUsd / max),
			tokens: t.tokens,
			steps: t.steps,
			perNode,
			source: costSourceSummary(run.ledger),
			warnings: run.thresholdsHit.map((h) => `budget threshold: ${h}`)
		};
	}
	status(run) {
		const node = run.cursor < 0 ? void 0 : workflowOf(run).nodes[run.cursor];
		return {
			runId: run.runId,
			status: run.status,
			currentNode: node?.path ?? null,
			pendingQuestion: run.pendingQuestion,
			pendingWork: run.status === "waiting_for_client" ? run.pendingWork : void 0,
			pendingWorkItems: run.status === "waiting_for_client" ? run.pendingWorkItems ?? (run.pendingWork ? [run.pendingWork] : []) : void 0,
			retryAfterMs: run.status === "running" ? 2e3 : null,
			next: nextHint(run),
			proposal: run.status === "needs_confirmation" ? run.proposal : void 0,
			cost: this.footer(run)
		};
	}
	report(run) {
		const byNode = {};
		const byTier = {};
		const byModel = {};
		const byCostSource = {};
		let harnessCostUsd = 0;
		let cacheTokens = 0;
		const coverage = {
			run: {
				llmSteps: 0,
				unknownSteps: 0
			},
			byTier: {},
			byModel: {}
		};
		const count = (target) => {
			target.llmSteps += 1;
		};
		const countUnknown = (target) => {
			target.unknownSteps += 1;
		};
		for (const r of run.ledger) {
			const cache = (r.cacheReadTokens ?? 0) + (r.cacheWrite5mTokens ?? 0) + (r.cacheWrite1hTokens ?? 0);
			cacheTokens += cache;
			const nodeEntry = byNode[r.nodePath] ??= {
				steps: 0,
				llmSteps: 0,
				unknownSteps: 0,
				tokens: 0,
				cacheTokens: 0,
				costUsd: 0,
				tier: r.tier,
				model: r.model ?? null,
				byAgent: {},
				costSource: ""
			};
			nodeEntry.cacheTokens += cache;
			const agentKey = r.agentId ?? r.nodePath.split("/").at(-1) ?? r.nodePath;
			const agentEntry = nodeEntry.byAgent[agentKey] ??= {
				steps: 0,
				llmSteps: 0,
				unknownSteps: 0,
				tokens: 0,
				cacheTokens: 0,
				costUsd: 0,
				tier: r.tier,
				model: r.model ?? null,
				agentName: r.agentName ?? null,
				costSource: "",
				sources: []
			};
			agentEntry.cacheTokens += cache;
			agentEntry.steps += 1;
			agentEntry.tokens += (r.inputTokens ?? 0) + (r.outputTokens ?? 0);
			agentEntry.costUsd += r.costUsd ?? 0;
			agentEntry.sources?.push(r.costSource);
			nodeEntry.steps += 1;
			nodeEntry.tokens += (r.inputTokens ?? 0) + (r.outputTokens ?? 0);
			nodeEntry.costUsd += r.costUsd ?? 0;
			const tierKey = r.tier ?? "script";
			byTier[tierKey] = (byTier[tierKey] ?? 0) + (r.costUsd ?? 0);
			if (r.kind === "llm") {
				const modelKey = r.model ?? "unknown";
				byModel[modelKey] = (byModel[modelKey] ?? 0) + (r.costUsd ?? 0);
				byCostSource[r.costSource] = (byCostSource[r.costSource] ?? 0) + 1;
				const targets = [
					coverage.run,
					coverage.byTier[tierKey] ??= {
						llmSteps: 0,
						unknownSteps: 0
					},
					coverage.byModel[modelKey] ??= {
						llmSteps: 0,
						unknownSteps: 0
					},
					nodeEntry,
					agentEntry
				];
				targets.forEach(count);
				if (r.costSource === "unknown") targets.forEach(countUnknown);
			}
			harnessCostUsd += r.harnessCostUsd ?? 0;
		}
		for (const [nodePath, entry] of Object.entries(byNode)) {
			entry.costUsd = round(entry.costUsd);
			if (new Set(Object.values(entry.byAgent).map((x) => x.tier)).size > 1) Object.assign(entry, {
				tier: "mixed",
				model: "mixed"
			});
			for (const agentEntry of Object.values(entry.byAgent)) {
				agentEntry.costUsd = round(agentEntry.costUsd);
				agentEntry.costSource = singleOrMixed(new Set(agentEntry.sources));
				delete agentEntry.sources;
			}
			entry.costSource = singleOrMixed(new Set(run.ledger.filter((r) => r.nodePath === nodePath).map((r) => r.costSource)));
		}
		for (const totals of [byTier, byModel]) for (const [key, value] of Object.entries(totals)) totals[key] = round(value);
		return {
			runId: run.runId,
			status: run.status,
			workflow: workflowLabel(run),
			backend: run.config?.backend,
			tierModels: run.config?.tiers,
			synthetic: (run.config ?? run.proposal).backend?.kind === "fake",
			byNode,
			byTier,
			byModel,
			byCostSource,
			coverage,
			cacheTokens,
			harnessCostUsd: round(harnessCostUsd),
			result: [...run.ledger].reverse().find((r) => typeof r.output === "string")?.output ?? null,
			cost: this.footer(run)
		};
	}
	trace(run) {
		const lines = [`run ${run.runId} [${run.status}] ${workflowLabel(run)}  $${round(this.totals(run).costUsd)}`];
		let lastNode = null;
		for (const r of run.ledger) {
			if (r.nodePath !== lastNode) {
				lines.push(`  ${r.nodePath} (${r.tier ?? "script"})`);
				lastNode = r.nodePath;
			}
			lines.push(`    turn ${r.turn}: in=${r.inputTokens} out=${r.outputTokens} $${r.costUsd == null ? "?" : round(r.costUsd)} ${r.costSource}`);
		}
		for (const e of run.events.filter((e) => [
			"needs_input",
			"run_resumed",
			"budget_threshold"
		].includes(e.type))) lines.push(`  event ${e.type} ${e.node ?? e.questionId ?? e.level ?? ""}`);
		return lines.join("\n");
	}
};
function configOf(run) {
	if (!run.config) throw new Error(`run ${run.runId} is not confirmed`);
	return run.config;
}
function nodeAt(run) {
	const node = run.cursor < 0 ? void 0 : workflowOf(run).nodes[run.cursor];
	if (!node) throw new Error(`run ${run.runId} has no node at cursor ${run.cursor}`);
	return node;
}
function tierOf(config, agent) {
	const tier = agent.role === void 0 ? void 0 : config.roles[agent.role];
	if (!tier) throw new Error(`no tier for role '${agent.role}'`);
	return tier;
}
function allowedOf(state, dotted) {
	const allowed = readPath(state, dotted.replace(/^state\./, ""));
	if (!Array.isArray(allowed) || allowed.length === 0 || !allowed.every((a) => typeof a === "string")) throw new Error(`allowedFrom ${dotted} is not a list of answers`);
	return allowed;
}
function agentsOf(run, node) {
	return run.nodeAgents?.[node.id] ?? node.agents ?? null;
}
function currentAgent(run, node) {
	const agents = agentsOf(run, node);
	if (!agents) return {
		id: node.localId ?? node.id,
		role: node.role,
		agentName: node.agent
	};
	const agent = agents[run.agentIndex ?? 0];
	if (!agent) throw new Error(`node ${node.path} has no agent ${run.agentIndex ?? 0}`);
	return {
		...agent,
		role: agent.role ?? node.role,
		agentName: agent.agentName ?? node.agent
	};
}
function singleOrMixed(sources) {
	const [first] = sources;
	return sources.size === 1 && first !== void 0 ? first : "mixed";
}
function costSourceSummary(ledger) {
	const sources = new Set(ledger.filter((r) => r.kind === "llm").map((r) => r.costSource));
	if (sources.size === 0) return "none";
	return singleOrMixed(sources);
}
function nextHint(run) {
	switch (run.status) {
		case "needs_confirmation": return "Show the proposal to the user. After the user replies, call factory_confirm.";
		case "running": return "Call factory_wait. factory_wait returns when the run needs the user, needs your node work in delegate mode, or ends. Do not call factory_status in a loop.";
		case "waiting_for_user": return "Ask the user pendingQuestion.text. Then send the user's answer with factory_answer.";
		case "waiting_for_client": return "Run every item of pendingWorkItems at the same time, each in its own subagent: use item.prompt, the model in item.model, and, when item.agentName is set, a subagent with that name whose instructions are item.agentInstructions (use your installed agent of that name if you have one). Call factory_submit once per item with its output, nodePath and agentId. If the subagent result shows a session id (for example <subagent sessionID=\"ses_...\">), pass it as usage.childSessionId.";
		default: return "The run has ended (done, stopped, cancelled or failed). Call factory_report. Show the user viewerUrl: it shows the whole flow and the cost of each agent. Do not call factory_wait or factory_status again.";
	}
}
function round(v) {
	return Math.round(v * 1e6) / 1e6;
}
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
function runReport(run) {
	return Factory.prototype.report.call(Factory.prototype, run);
}
// app/csp.ts
var NONCE_PLACEHOLDER = "FACTORYCSPNONCEPLACEHOLD";
function createNonce() {
	return randomBytes(18).toString("base64");
}
function cspHeader(nonce) {
	return [
		"default-src 'self'",
		`script-src 'self' 'nonce-${nonce}'`,
		`style-src 'self' 'nonce-${nonce}'`,
		"img-src 'self' data:",
		"font-src 'self'",
		"connect-src 'self' ws://127.0.0.1:* ws://localhost:*",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'none'",
		"frame-ancestors 'none'"
	].join("; ");
}
function isHtml(res) {
	return String(res.getHeader("content-type") ?? "").includes("text/html");
}
function cspMiddleware({ nonceFactory = createNonce } = {}) {
	return (_req, res, next) => {
		const nonce = nonceFactory();
		const end = res.end.bind(res);
		res.end = (chunk, ...rest) => {
			if (!chunk || !isHtml(res)) return end(chunk, ...rest);
			const html = (Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)).replaceAll(NONCE_PLACEHOLDER, nonce);
			if (!res.headersSent) {
				res.setHeader("Content-Security-Policy", cspHeader(nonce));
				res.removeHeader("Content-Length");
			}
			return end(html, ...rest);
		};
		next();
	};
}
// src/standalone.ts
var AGENT_FILE = /(agents\/opencode\/[a-z0-9-]+\.md|plugins\/[a-z0-9-]+\/agents\/[a-z0-9-]+\.md)/;
function sourceAgentFile(spec) {
	return spec.source?.match(AGENT_FILE)?.[1] ?? null;
}
function invokable(agentFile, marketplace) {
	if (agentFile.startsWith("plugins/")) return true;
	const file = path.join(marketplace, agentFile);
	if (!fs.existsSync(file)) return false;
	const mode = fs.readFileSync(file, "utf8").match(/^---[\s\S]*?^mode:\s*([a-z]+)/m)?.[1] ?? "all";
	return mode === "primary" || mode === "all";
}
function standaloneNames(specs, marketplace) {
	const owner = new Map(specs.map((s) => [s.name, sourceAgentFile(s)]));
	const inner = /* @__PURE__ */ new Set();
	for (const spec of specs) for (const node of spec.nodes) if (node.workflow && owner.get(node.workflow) !== null && owner.get(node.workflow) === owner.get(spec.name)) inner.add(node.workflow);
	return new Set(specs.filter((s) => {
		const agent = owner.get(s.name);
		return agent !== null && agent !== void 0 && !inner.has(s.name) && invokable(agent, marketplace);
	}).map((s) => s.name));
}
// app/data.ts
var RUN_ID = /^r-[a-f0-9]{8}$/;
function readJson(file) {
	return JSON.parse(fs.readFileSync(file, "utf8"));
}
async function finishFakeRun(factory, goal) {
	const { run } = factory.start(goal);
	factory.confirm(run.runId, { backend: { kind: "fake" } });
	for (;;) {
		const { run: current } = await factory.waitForChange(run.runId, 3e4);
		const question = current.pendingQuestion;
		if (current.status === "waiting_for_user" && question) {
			factory.answer(run.runId, question.id, question.id === "q-budget-pause" ? "continue" : "extend");
			continue;
		}
		if (current.status !== "running") return current;
	}
}
function createDataApi({ factoryDir, dataDir, configFile, demo }) {
	const runsDir = path.join(dataDir, "runs");
	function runFiles() {
		if (!fs.existsSync(runsDir)) return [];
		return fs.readdirSync(runsDir).filter((f) => RUN_ID.test(path.basename(f, ".json")));
	}
	function allRunFiles() {
		const sources = [path.resolve(dataDir), ...path.resolve(dataDir) === path.resolve(homeDataDir()) ? readSources() : []];
		return [...new Set(sources)].flatMap((dir) => {
			const runs = path.join(dir, "runs");
			if (!fs.existsSync(runs)) return [];
			const source = dir === path.resolve(dataDir) ? "main" : `test · ${path.basename(dir)}`;
			return fs.readdirSync(runs).filter((f) => RUN_ID.test(path.basename(f, ".json"))).map((f) => ({
				file: path.join(runs, f),
				source
			}));
		});
	}
	let demoRun = null;
	return {
		dataDir,
		async ensureDemo() {
			if (demoRun) {
				await demoRun;
				return false;
			}
			if (!demo || runFiles().length > 0) return false;
			demoRun = finishFakeRun(new Factory(dataDir, { backend: "fake" }), "add a greeting function (demo run, fake model)").catch((error) => {
				demoRun = null;
				throw error;
			});
			await demoRun;
			return true;
		},
		workflows() {
			const specs = loadWorkflowSpecs(path.join(factoryDir, "workflows"));
			const standalone = standaloneNames(specs, marketplaceDir());
			return specs.map((s) => ({
				...s,
				standalone: standalone.has(s.name)
			}));
		},
		agents() {
			const names = /* @__PURE__ */ new Set();
			for (const w of loadWorkflowSpecs(path.join(factoryDir, "workflows"))) for (const n of w.nodes) {
				if (n.agent) names.add(n.agent);
				if (n.skill) names.add(n.skill);
				for (const a of n.agents ?? []) if (a.agent) names.add(a.agent);
			}
			return Object.fromEntries([...names].sort().flatMap((name) => {
				const info = describeAgent(name);
				return info ? [[name, info]] : [];
			}));
		},
		config() {
			const text = fs.readFileSync(configFile, "utf8");
			return /\.ya?ml$/i.test(configFile) ? (0, import_dist$1.parse)(text) : JSON.parse(text);
		},
		runs() {
			return allRunFiles().flatMap(({ file, source }) => {
				try {
					return [{
						run: readJson(file),
						source
					}];
				} catch {
					return [];
				}
			}).map(({ run, source }) => ({
				run,
				source,
				report: runReport(run)
			})).map(({ run, source, report }) => ({
				source,
				runId: run.runId,
				goal: run.goal,
				workflow: report.workflow.split("@")[0] ?? report.workflow,
				status: run.status,
				createdAt: run.events[0]?.at ?? null,
				costUsd: report.cost.costUsd,
				coverage: report.coverage.run,
				harness: run.config?.backend?.kind === "cli" ? run.config.backend.cli ?? null : run.config?.backend?.kind ?? null,
				synthetic: report.synthetic,
				requestedModels: [...new Set(Object.values(run.config?.tiers ?? {}))],
				usedModels: [...new Set(run.ledger.filter((r) => r.kind === "llm" && r.model).map((r) => r.model ?? ""))]
			})).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
		},
		run(runId) {
			if (!RUN_ID.test(runId)) return null;
			const file = allRunFiles().find((f) => path.basename(f.file, ".json") === runId)?.file;
			if (!file || !fs.existsSync(file)) return null;
			const run = readJson(file);
			const { runId: id, goal, status, config, answers, ledger, events, pendingQuestion } = run;
			return {
				run: {
					runId: id,
					goal,
					status,
					config,
					answers,
					ledger,
					events,
					pendingQuestion
				},
				report: runReport(run)
			};
		}
	};
}
function apiMiddleware(api) {
	return async (req, res, next) => {
		if (req.method !== "GET") return next();
		const url = new URL(req.url ?? "/", "http://localhost");
		const send = (status, body) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
		try {
			if (url.pathname === "/api/workflows") return send(200, api.workflows());
			if (url.pathname === "/api/agents") return send(200, api.agents());
			if (url.pathname === "/api/config") return send(200, api.config());
			if (url.pathname === "/api/runs") {
				await api.ensureDemo();
				return send(200, api.runs());
			}
			const match = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
			if (match?.[1] !== void 0) {
				const detail = api.run(match[1]);
				return detail ? send(200, detail) : send(404, { error: "run not found" });
			}
			return next();
		} catch (error) {
			return send(500, { error: errorMessage(error) });
		}
	};
}
// src/viewer-routes.ts
var PREFIX = "/viewer";
var TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
	".json": "application/json"
};
function viewerUrlFor(publicUrl, runId) {
	return `${publicUrl.replace(/\/$/, "")}${PREFIX}/?run=${encodeURIComponent(runId)}`;
}
function allowedHostsFor(publicUrl, port) {
	const hosts = /* @__PURE__ */ new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
	hosts.add(new URL(publicUrl).host.toLowerCase());
	return hosts;
}
function staticFile(viewerDir, relativePath) {
	const root = path.resolve(viewerDir);
	const full = path.resolve(root, relativePath === "" ? "index.html" : relativePath);
	if (full !== root && !full.startsWith(root + path.sep)) return null;
	if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
	return full;
}
function viewerHandler({ viewerDir, dataDir, factoryDir, configFile, allowedHosts }) {
	const api = apiMiddleware(createDataApi({
		factoryDir,
		dataDir,
		configFile,
		demo: false
	}));
	const csp = cspMiddleware();
	return (req, res) => {
		const url = new URL(req.url ?? "/", "http://localhost");
		if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;
		if (!allowedHosts.has(String(req.headers.host ?? "").toLowerCase())) {
			res.writeHead(403, { "content-type": "text/plain" }).end("forbidden host");
			return true;
		}
		if (req.method !== "GET") {
			res.writeHead(405, { allow: "GET" }).end();
			return true;
		}
		if (url.pathname === PREFIX) {
			res.writeHead(302, { location: `${PREFIX}/${url.search}` }).end();
			return true;
		}
		const relative = decodeURIComponent(url.pathname.slice(8));
		res.setHeader("x-content-type-options", "nosniff");
		res.setHeader("referrer-policy", "no-referrer");
		if (relative.startsWith("api/")) {
			req.url = `/${relative}${url.search}`;
			api(req, res, () => res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "not found" })));
			return true;
		}
		if (!fs.existsSync(path.join(viewerDir, "index.html"))) {
			res.writeHead(503, { "content-type": "text/plain" }).end("viewer is not built; run the factory setup (node factory/setup.ts)");
			return true;
		}
		const file = staticFile(viewerDir, relative);
		if (!file) {
			res.writeHead(404, { "content-type": "text/plain" }).end("not found");
			return true;
		}
		const type = TYPES[path.extname(file)] ?? "application/octet-stream";
		res.setHeader("content-type", type);
		if (type.startsWith("text/html")) {
			res.setHeader("cache-control", "no-store");
			csp(req, res, () => {});
		}
		res.end(fs.readFileSync(file));
		return true;
	};
}
export { registerDataSource as _, errorMessage as a, require_dist as c, claudeTools as d, opencodeConfigDir as f, defaultDataDir as g, VIEWER_HEALTH as h, Factory as i, require_ajv as l, FACTORY_DIR as m, viewerHandler as n, parseBackend as o, DEFAULT_VIEWER_PORT as p, viewerUrlFor as r, parseCli as s, allowedHostsFor as t, claudeAgentsFile as u, viewerOptions as v, __toESM as y };
