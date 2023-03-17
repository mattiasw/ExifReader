import {load} from '../../exif-reader.js';

load('', {includeUnknown: true});
load('', {length: 1024});
load('', {expanded: false, includeUnknown: true, length: 1024});

const tags = await load('');
const expandedTags = await load('', {expanded: true});

////////
// PNG
tags['Color Type']?.description === 'Grayscale';

expandedTags.png?.['Color Type']?.description === 'Grayscale';
expandedTags.png?.['Pixel Units']?.value === 1;
// @ts-expect-error
expandedTags.png?.['Pixel Units']?.value === 'a string';
expandedTags.png?.['Pixel Units']?.description === 'meters';
// @ts-expect-error
expandedTags.png?.['Color Type']?.description === 'A non-color type value';
expandedTags.png?.['Custom Tag Name']?.description === 'Should work';
