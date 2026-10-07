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

const parseNameFunctionVisitor = {
    ReturnStatement(path, opts) {
        if ((path.node.argument.type === 'StringLiteral') && opts.include.includes(path.node.argument.value.toLowerCase())) {
            opts.result.isIncluded = true;
        }
    }
};

function tagNameIsIncluded(path, valuePath, include) {
    for (const propertyPath of valuePath.get('properties')) {
        if (propertyPath.node.key.value === 'name' || propertyPath.node.key.name === 'name') { // Property key can be string or identifier ('name' vs. name).
            if (propertyPath.node.value.type === 'ArrowFunctionExpression') {
                const result = {isIncluded: false};
                propertyPath.traverse(parseNameFunctionVisitor, {include, result});
                return result.isIncluded;
            }
            if (include.includes(propertyPath.node.value.value.toLowerCase())) {
                return true;
            }
        }
    }
    return false;
}

module.exports = function TagFilter() {
    return {
        name: 'TagFilter',
        visitor: {
            ExportDefaultDeclaration(path, state) {
                const type = getFileModuleType(state.filename);
                const declarationPath = path.get('declaration');
                if (type && Array.isArray(state.opts.include[type]) && declarationPath.isObjectExpression()) {
                    filterTagDictionary(declarationPath, state.opts.include[type].map((tagName) => tagName.toLowerCase()));
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
function filterTagDictionary(dictionaryPath, include) {
    for (const propertyPath of dictionaryPath.get('properties')) {
        if (!propertyPath.isObjectProperty()) {
            continue;
        }
        const valuePath = propertyPath.get('value');
        if (propertyPath.node.key.type === 'NumericLiteral') {
            if (valuePath.isStringLiteral() && !include.includes(valuePath.node.value.toLowerCase())) {
                propertyPath.remove();
            } else if (valuePath.isObjectExpression() && !tagNameIsIncluded(propertyPath, valuePath, include)) {
                propertyPath.remove();
            }
        } else if (valuePath.isObjectExpression()) {
            filterTagDictionary(valuePath, include);
        }
    }
}
