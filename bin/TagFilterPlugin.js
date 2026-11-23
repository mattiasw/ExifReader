/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const modules = {
    exif: [
        'src[/\\\\]tag-names-0th-ifd.js',
        'src[/\\\\]tag-names-exif-ifd.js',
        'src[/\\\\]tag-names-gps-ifd.js',
        'src[/\\\\]tag-names-interoperability-ifd.js'
    ],
    iptc: [
        'src[/\\\\]iptc-tag-names.js'
    ],
    mpf: [
        'src[/\\\\]tag-names-mpf-ifd.js'
    ]
};

const SUPPORTED_NAME_FORMS = 'A tag name must be a string literal, a template literal without expressions,'
    + ' a conditional or logical expression of these, or an arrow function whose body or return statements'
    + ' are one of these.';

module.exports = function TagFilter() {
    return {
        name: 'TagFilter',
        visitor: {
            ExportDefaultDeclaration(path, state) {
                const type = getFileModuleType(state.filename);
                const declarationPath = path.get('declaration');
                if (type && Array.isArray(state.opts.include[type]) && declarationPath.isObjectExpression()) {
                    filterTagDictionary(
                        declarationPath,
                        state.opts.include[type].map((tagName) => tagName.toLowerCase()),
                        state.filename
                    );
                }
            }
        }
    };
};

function getFileModuleType(filename) {
    for (const module in modules) {
        for (const file of modules[module]) {
            if (endsWith(filename, file)) {
                return module;
            }
        }
    }
    return false;
}

function endsWith(string, suffix) {
    return new RegExp(`${suffix}$`).test(string);
}

// Walks only the dictionary's own entries: the lookup tables inside a tag's
// description share the numeric-key shape and must stay.
function filterTagDictionary(dictionaryPath, include, filename) {
    for (const propertyPath of dictionaryPath.get('properties')) {
        if (!propertyPath.isObjectProperty()) {
            continue;
        }
        const valuePath = propertyPath.get('value');
        if (propertyPath.node.key.type === 'NumericLiteral') {
            const names = getEntryNames(valuePath, {filename, id: propertyPath.node.key.value});
            if (!names.some((name) => include.includes(name.toLowerCase()))) {
                propertyPath.remove();
            }
        } else if (valuePath.isObjectExpression()) {
            filterTagDictionary(valuePath, include, filename);
        }
    }
}

function getEntryNames(valuePath, context) {
    if (valuePath.isObjectExpression()) {
        return getNameStrings(getNamePath(valuePath, context), context);
    }
    return getExpressionStrings(valuePath.node, context);
}

function getNamePath(entryPath, context) {
    let namePath;
    for (const memberPath of entryPath.get('properties')) {
        const member = memberPath.node;
        if (memberPath.isSpreadElement()) {
            throwUnreadableName(context, 'SpreadElement');
        }
        if (member.computed && member.key.type !== 'StringLiteral') {
            throwUnreadableName(context, 'a computed key');
        }
        if (isNameKey(member)) {
            if (memberPath.isObjectMethod()) {
                throwUnreadableName(context, 'ObjectMethod');
            }
            namePath = memberPath.get('value');
        }
    }
    if (!namePath) {
        throwUnreadableName(context, 'an entry without a name');
    }
    return namePath;
}

function isNameKey(member) {
    return (member.key.type === 'Identifier' && member.key.name === 'name')
        || (member.key.type === 'StringLiteral' && member.key.value === 'name');
}

function getNameStrings(namePath, context) {
    if (namePath.isArrowFunctionExpression()) {
        return getArrowStrings(namePath, context);
    }
    return getExpressionStrings(namePath.node, context);
}

function getArrowStrings(arrowPath, context) {
    const body = arrowPath.node.body;
    if (body.type !== 'BlockStatement') {
        return getExpressionStrings(body, context);
    }
    const returnPaths = [];
    arrowPath.get('body').traverse({
        Function(path) {
            path.skip();
        },
        ReturnStatement(path) {
            returnPaths.push(path);
        }
    });
    if (returnPaths.length === 0) {
        throwUnreadableName(context, 'ArrowFunctionExpression without a return statement');
    }
    const strings = [];
    for (const returnPath of returnPaths) {
        const argument = returnPath.node.argument;
        if (!argument) {
            throwUnreadableName(context, 'ReturnStatement without an argument');
        }
        strings.push(...getExpressionStrings(argument, context));
    }
    return strings;
}

function getExpressionStrings(node, context) {
    if (node.type === 'StringLiteral') {
        return [node.value];
    }
    if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
        return [node.quasis[0].value.cooked];
    }
    if (node.type === 'ConditionalExpression') {
        return getExpressionStrings(node.consequent, context).concat(getExpressionStrings(node.alternate, context));
    }
    if (node.type === 'LogicalExpression') {
        // Either operand can be the result of a logical expression, so both
        // must be readable.
        return getExpressionStrings(node.left, context).concat(getExpressionStrings(node.right, context));
    }
    return throwUnreadableName(context, node.type);
}

function throwUnreadableName(context, found) {
    throw new Error(
        `Cannot read the name of tag ${getHex(context.id)} in ${context.filename}`
        + ` for a custom build with a tag list: found ${found}. ${SUPPORTED_NAME_FORMS}`
    );
}

function getHex(id) {
    return '0x' + id.toString(16).padStart(4, '0');
}
