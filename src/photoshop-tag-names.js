/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Types from './types.js';
import {
    getPascalStringFromDataView,
    padStart,
    parseFloatRadix,
    strRepeat
} from './utils.js';

// export const OsTypeKeys = {
//     OBJC: 'Objc',
//     DOUB: 'doub',
//     UNTF: 'UntF',
//     TEXT: 'TEXT',
//     BOOL: 'bool',
//     ENUM: 'enum',
//     LONG: 'long'
// };

export const PathRecordTypes = {
    CLOSED_SUBPATH_LENGTH: 0,
    CLOSED_SUBPATH_BEZIER_LINKED: 1,
    CLOSED_SUBPATH_BEZIER_UNLINKED: 2,
    OPEN_SUBPATH_LENGTH: 3,
    OPEN_SUBPATH_BEZIER_LINKED: 4,
    OPEN_SUBPATH_BEZIER_UNLINKED: 5,
    FILL_RULE: 6,
    CLIPBOARD: 7,
    INITIAL_FILL_RULE: 8
};

const PATH_RECORD_SIZE = 24;

export default {
    // 0x0425: {
    //     name: 'CaptionDigest',
    //     description(dataView) {
    //         let description = '';
    //         for (let i = 0; i < dataView.byteLength; i++) {
    //             const byte = dataView.getUint8(i);
    //             description += padStart(byte.toString(16), 2, '0');
    //         }
    //         return description;
    //     }
    // },
    // Commented out for now to lower bundle size until someone asks for it.
    // 0x043a: {
    //     name: 'PrintInformation',
    //     description: parseDescriptor
    // },
    // 0x043b: {
    //     name: 'PrintStyle',
    //     description: parseDescriptor
    // },
    0x07d0: {
        name: 'PathInformation',
        description: pathResource
    },
    0x0bb7: {
        name: 'ClippingPathName',
        description(dataView) {
            const [, string] = getPascalStringFromDataView(dataView, 0);
            return string;
        }
    },
};

// function parseDescriptor(dataView) {
//     const DESCRIPTOR_VERSION_SIZE = 4;
//     // This is a unicode string terminated with null. Unsure about the format though since in my example image it starts with 0x0000.
//     const UNCLEAR_CLASS_ID_NAME_PART_SIZE = 6;
//     let offset = 0;
//     offset += DESCRIPTOR_VERSION_SIZE + UNCLEAR_CLASS_ID_NAME_PART_SIZE;
//     const [classId, classIdSize] = getBlockValue(dataView, offset);
//     offset += classIdSize;
//     const numItems = Types.getLongAt(dataView, offset);
//     offset += 4;
//     const descriptor = {[classId]: {}};
//     for (let i = 0; i < numItems; i++) {
//         const [itemKey, itemKeySize] = getBlockValue(dataView, offset);
//         offset += itemKeySize;
//         const osTypeKey = getStringFromDataView(dataView, offset, 4);
//         offset += 4;
//         try {
//             const {itemValue, itemSize} = getItemValue(dataView, offset, osTypeKey);
//             offset += itemSize;
//             descriptor[classId][ITEM_KEY_TERMS[itemKey] || itemKey] = itemValue;
//         } catch (error) {
//             // We can't recover from unknown OS type key since we don't know
//             // where the next one starts.
//             break;
//         }
//     }
//     return JSON.stringify(descriptor);
// }

// function getBlockValue(dataView, offset, unicode = false) {
//     const length = (unicode ? 2 : 1) * Types.getLongAt(dataView, offset) || 4;
//     offset += 4;
//     const value = (unicode ? getUnicodeStringFromDataView : getStringFromDataView)(dataView, offset, length);
//     offset += length;
//     return [value, 4 + length];
// }

// function getItemValue(dataView, offset, osTypeKey) {
//     // Not all OSType keys are implemented yet because they are missing in the example image.
//     if (osTypeKey === OsTypeKeys.OBJC) {
//         const [classIdName, classIdNameSize] = getBlockValue(dataView, offset, true);
//         offset += classIdNameSize;
//         const [classId, classIdSize] = getBlockValue(dataView, offset);
//         offset += classIdSize;
//         const _offset = Types.getLongAt(dataView, offset);
//         return {
//             itemValue: {[classIdName]: {[classId]: _offset}},
//             itemSize: classIdNameSize + classIdSize + 4
//         };
//     }
//     if (osTypeKey === OsTypeKeys.DOUB) {
//         return {
//             itemValue: parseDouble(dataView, offset),
//             itemSize: 8
//         };
//     }
//     if (osTypeKey === OsTypeKeys.UNTF) {
//         const unit = getStringFromDataView(dataView, offset, 4);
//         return {
//             itemValue: {unit, value: parseDouble(dataView, offset + 4)},
//             itemSize: unit.length + 8
//         };
//     }
//     if (osTypeKey === OsTypeKeys.TEXT) {
//         const length = 2 * Types.getLongAt(dataView, offset);
//         offset += 4;
//         const text = getUnicodeStringFromDataView(dataView, offset, length);
//         return {
//             itemValue: text,
//             itemSize: 4 + length
//         };
//     }
//     if (osTypeKey === OsTypeKeys.BOOL) {
//         return {
//             itemValue: Types.getByteAt(dataView, offset) === 1,
//             itemSize: 1
//         };
//     }
//     if (osTypeKey === OsTypeKeys.ENUM) {
//         const [type, typeSize] = getBlockValue(dataView, offset);
//         offset += typeSize;
//         const [enumName, enumSize] = getBlockValue(dataView, offset);
//         return {
//             itemValue: {[type]: enumName},
//             itemSize: typeSize + enumSize
//         };
//     }
//     if (osTypeKey === OsTypeKeys.LONG) {
//         return {
//             itemValue: Types.getLongAt(dataView, offset),
//             itemSize: 4
//         };
//     }
//     throw new Error(`Unknown OS type key: ${osTypeKey}`);
// }

// function parseDouble(dataView, offset) {
//     const BIAS = 1023;
//     const sign = (Types.getByteAt(dataView, offset) & parseInt('10000000', 2)) === 0 ? 1 : -1;
//     const exponent = ((Types.getShortAt(dataView, offset) & parseInt('0111111111110000', 2)) >> 4) - BIAS;
//     const fractionHigh = padStart((Types.getLongAt(dataView, offset) & parseInt('00000000000011111111111111111111', 2)).toString(2), 20, '0');
//     const fractionLow = padStart(Types.getLongAt(dataView, offset + 4).toString(2), 32, '0');
//     const fraction = parseFloatRadix('1.' + fractionHigh + fractionLow, 2);
//     return sign * fraction * Math.pow(2, exponent);
// }

function pathResource(dataView) {
    const TYPE_SIZE = 2;
    const types = {};
    const paths = [];

    for (let offset = 0; offset < dataView.byteLength; offset += TYPE_SIZE + PATH_RECORD_SIZE) {
        const type = Types.getShortAt(dataView, offset);
        if (PATH_RECORD_TYPES[type]) {
            if (!types[type]) {
                types[type] = PATH_RECORD_TYPES[type].description;
            }
            paths.push({
                type,
                path: PATH_RECORD_TYPES[type].path(dataView, offset + TYPE_SIZE)
            });
        }
    }
    return JSON.stringify({types, paths});
}

const PATH_RECORD_TYPES = {
    [PathRecordTypes.CLOSED_SUBPATH_LENGTH]: {
        description: 'Closed subpath length',
        path: (dataView, offset) => [Types.getShortAt(dataView, offset)]
    },
    [PathRecordTypes.CLOSED_SUBPATH_BEZIER_LINKED]: {
        description: 'Closed subpath Bezier knot, linked',
        path: parseBezierKnot
    },
    [PathRecordTypes.CLOSED_SUBPATH_BEZIER_UNLINKED]: {
        description: 'Closed subpath Bezier knot, unlinked',
        path: parseBezierKnot
    },
    [PathRecordTypes.OPEN_SUBPATH_LENGTH]: {
        description: 'Open subpath length',
        path: (dataView, offset) => [Types.getShortAt(dataView, offset)]
    },
    [PathRecordTypes.OPEN_SUBPATH_BEZIER_LINKED]: {
        description: 'Open subpath Bezier knot, linked',
        path: parseBezierKnot
    },
    [PathRecordTypes.OPEN_SUBPATH_BEZIER_UNLINKED]: {
        description: 'Open subpath Bezier knot, unlinked',
        path: parseBezierKnot
    },
    [PathRecordTypes.FILL_RULE]: {
        description: 'Path fill rule',
        path: () => []
    },
    [PathRecordTypes.INITIAL_FILL_RULE]: {
        description: 'Initial fill rule',
        path: (dataView, offset) => [Types.getShortAt(dataView, offset)]
    },
    [PathRecordTypes.CLIPBOARD]: {
        description: 'Clipboard',
        path: parseClipboard
    }
};

function parseBezierKnot(dataView, offset) {
    const PATH_POINT_SIZE = 8;
    const path = [];
    for (let i = 0; i < PATH_RECORD_SIZE; i += PATH_POINT_SIZE) {
        path.push(parsePathPoint(dataView, offset + i));
    }
    return path;
}

function parsePathPoint(dataView, offset) {
    const vertical = getFixedPointNumber(dataView, offset, 8);
    const horizontal = getFixedPointNumber(dataView, offset + 4, 8);
    return [horizontal, vertical];
}

function parseClipboard(dataView, offset) {
    return [
        [
            getFixedPointNumber(dataView, offset, 8), // Top
            getFixedPointNumber(dataView, offset + 4, 8), // Left
            getFixedPointNumber(dataView, offset + 8, 8), // Botton
            getFixedPointNumber(dataView, offset + 12, 8), // Right
        ],
        getFixedPointNumber(dataView, offset + 16, 8) // Resolution
    ];
}

function getFixedPointNumber(dataView, offset, binaryPoint) {
    const number = Types.getLongAt(dataView, offset);

    const sign = (number >>> 31) === 0 ? 1 : -1;
    const integer = (number & 0x7f000000) >>> (32 - binaryPoint);
    const fraction = number & parseInt(strRepeat('1', 32 - binaryPoint), 2);

    return sign * parseFloatRadix(integer.toString(2) + '.' + padStart(fraction.toString(2), 32 - binaryPoint, '0'), 2);
}

// Item key terminology: https://psd-tools.readthedocs.io/en/latest/reference/psd_tools.terminology.html
// Are these correct? There are collisions that are commented out. A lot of code for little gain?
// const ITEM_KEY_TERMS = {
//     'A   ': 'A',
//     'Adjs': 'Adjustment',
//     'Algd': 'Aligned',
//     'Algn': 'Alignment',
//     'AllE': 'AllExcept',
//     'All ': 'AllPS',
//     'AlTl': 'AllToolOptions',
//     'AChn': 'AlphaChannelOptions',
//     'AlpC': 'AlphaChannels',
//     'AmbB': 'AmbientBrightness',
//     'AmbC': 'AmbientColor',
//     'Amnt': 'Amount',
//     'AmMx': 'AmplitudeMax',
//     'AmMn': 'AmplitudeMin',
//     'Anch': 'Anchor',
//     'Angl': 'Angle',
//     'Ang1': 'Angle1',
//     'Ang2': 'Angle2',
//     'Ang3': 'Angle3',
//     'Ang4': 'Angle4',
//     'AntA': 'AntiAlias',
//     'Appe': 'Append',
//     'Aply': 'Apply',
//     'Ar  ': 'Area',
//     'Arrw': 'Arrowhead',
//     'As  ': 'As',
//     'Asst': 'AssetBin',
//     'AssC': 'AssumedCMYK',
//     'AssG': 'AssumedGray',
//     'AssR': 'AssumedRGB',
//     'At  ': 'At',
//     'Auto': 'Auto',
//     'AuCo': 'AutoContrast',
//     'Atrs': 'AutoErase',
//     'AtKr': 'AutoKern',
//     'AtUp': 'AutoUpdate',
//     'Axis': 'Axis',
//     'B   ': 'B',
//     'Bckg': 'Background',
//     'BckC': 'BackgroundColor',
//     'BckL': 'BackgroundLevel',
//     'Bwd ': 'Backward',
//     'Blnc': 'Balance',
//     'Bsln': 'BaselineShift',
//     'BpWh': 'BeepWhenDone',
//     'BgnR': 'BeginRamp',
//     'BgnS': 'BeginSustain',
//     'bvlD': 'BevelDirection',
//     'ebbl': 'BevelEmboss',
//     'bvlS': 'BevelStyle',
//     'bvlT': 'BevelTechnique',
//     'BgNH': 'BigNudgeH',
//     'BgNV': 'BigNudgeV',
//     'BtDp': 'BitDepth',
//     'Blck': 'Black',
//     'BlcC': 'BlackClip',
//     'Blcn': 'BlackGeneration',
//     'BlcG': 'BlackGenerationCurve',
//     'BlcI': 'BlackIntensity',
//     'BlcL': 'BlackLevel',
//     // 'BlcL': 'BlackLimit',
//     'Bld ': 'Bleed',
//     'Blnd': 'BlendRange',
//     'Bl  ': 'Blue',
//     'BlBl': 'BlueBlackPoint',
//     'blueFloat': 'BlueFloat',
//     'BlGm': 'BlueGamma',
//     'BlWh': 'BlueWhitePoint',
//     'BlX ': 'BlueX',
//     'BlY ': 'BlueY',
//     'blur': 'Blur',
//     'BlrM': 'BlurMethod',
//     'BlrQ': 'BlurQuality',
//     'Bk  ': 'Book',
//     'BrdT': 'BorderThickness',
//     'Btom': 'Bottom',
//     'Brgh': 'Brightness',
//     'BrsD': 'BrushDetail',
//     'BrsS': 'BrushSize',
//     'BrsT': 'BrushType',
//     'Brsh': 'Brushes',
//     'BmpA': 'BumpAmplitude',
//     'BmpC': 'BumpChannel',
//     'By  ': 'By',
//     'Byln': 'Byline',
//     'BylT': 'BylineTitle',
//     'BytO': 'ByteOrder',
//     'CMYS': 'CMYKSetup',
//     'CchP': 'CachePrefs',
//     'Clcl': 'Calculation',
//     'Clbr': 'CalibrationBars',
//     'Cptn': 'Caption',
//     'CptW': 'CaptionWriter',
//     'Ctgr': 'Category',
//     'ClSz': 'CellSize',
//     'Cntr': 'Center',
//     'CntC': 'CenterCropMarks',
//     'ChlA': 'ChalkArea',
//     'Chnl': 'Channel',
//     'ChMx': 'ChannelMatrix',
//     'ChnN': 'ChannelName',
//     'Chns': 'Channels',
//     'ChnI': 'ChannelsInterleaved',
//     'ChAm': 'CharcoalAmount',
//     'ChrA': 'CharcoalArea',
//     'Ckmt': 'ChokeMatte',
//     'ChFX': 'ChromeFX',
//     'City': 'City',
//     'ClrA': 'ClearAmount',
//     'ClPt': 'ClippingPath',
//     'ClpP': 'ClippingPathEPS',
//     'ClpF': 'ClippingPathFlatness',
//     'ClpI': 'ClippingPathIndex',
//     'Clpg': 'ClippingPathInfo',
//     'ClnS': 'CloneSource',
//     'Clsp': 'ClosedSubpath',
//     'Clr ': 'Color',
//     'Clrh': 'ColorChannels',
//     'ClrC': 'ColorCorrection',
//     'ClrI': 'ColorIndicates',
//     'ClMg': 'ColorManagement',
//     'Clrr': 'ColorPickerPrefs',
//     'ClrS': 'ColorSpace',
//     'ClrT': 'ColorTable',
//     'Clrz': 'Colorize',
//     'Clrs': 'Colors',
//     'ClrL': 'ColorsList',
//     'ClmW': 'ColumnWidth',
//     'CmdK': 'CommandKey',
//     'Cmpn': 'Compensation',
//     'Cmpr': 'Compression',
//     'Cncv': 'Concavity',
//     'Cndt': 'Condition',
//     'Cnst': 'Constant',
//     // 'Cnst': 'Constrain',
//     'CnsP': 'ConstrainProportions',
//     'Cfov': 'ConstructionFOV',
//     'Cntg': 'Contiguous',
//     'Cntn': 'Continue',
//     'Cnty': 'Continuity',
//     'ShpC': 'ContourType',
//     // 'Cntr': 'Contrast',
//     'Cnvr': 'Convert',
//     'Cpy ': 'Copy',
//     'Cpyr': 'Copyright',
//     'CprN': 'CopyrightNotice',
//     'CrnC': 'CornerCropMarks',
//     'Cnt ': 'Count',
//     'CntN': 'CountryName',
//     'CrcB': 'CrackBrightness',
//     'CrcD': 'CrackDepth',
//     'CrcS': 'CrackSpacing',
//     'blfl': 'CreateLayersFromLayerFX',
//     'Crdt': 'Credit',
//     'Crss': 'Crossover',
//     'Crnt': 'Current',
//     'CrnH': 'CurrentHistoryState',
//     'CrnL': 'CurrentLight',
//     'CrnT': 'CurrentToolOptions',
//     'Crv ': 'Curve',
//     'CrvF': 'CurveFile',
//     'Cstm': 'Custom',
//     'CstF': 'CustomForced',
//     'CstM': 'CustomMatte',
//     'CstP': 'CustomPalette',
//     'Cyn ': 'Cyan',
//     'DCS ': 'DCS',
//     'DPXf': 'DPXFormat',
//     'DrkI': 'DarkIntensity',
//     'Drkn': 'Darkness',
//     'DtCr': 'DateCreated',
//     'Dt ': 'Datum',
//     'Dfnt': 'Definition',
//     'Dnst': 'Density',
//     'Dpth': 'Depth',
//     'Dstl': 'DestBlackMax',
//     'DstB': 'DestBlackMin',
//     'Dstt': 'DestWhiteMax',
//     'DstW': 'DestWhiteMin',
//     'DstM': 'DestinationMode',
//     'Dtl ': 'Detail',
//     'Dmtr': 'Diameter',
//     'DffD': 'DiffusionDither',
//     'Drct': 'Direction',
//     'DrcB': 'DirectionBalance',
//     'DspF': 'DisplaceFile',
//     'DspM': 'DisplacementMap',
//     'DspP': 'DisplayPrefs',
//     'Dstn': 'Distance',
//     // 'Dstr': 'Distortion',
//     // 'Dstr': 'Distribution',
//     'Dthr': 'Dither',
//     'DthA': 'DitherAmount',
//     'Dthp': 'DitherPreserve',
//     'Dthq': 'DitherQuality',
//     'DocI': 'DocumentID',
//     'DtGn': 'DotGain',
//     'DtGC': 'DotGainCurves',
//     'DrSh': 'DropShadow',
//     'Dplc': 'Duplicate',
//     'DnmC': 'DynamicColorSliders',
//     'Edg ': 'Edge',
//     'EdgB': 'EdgeBrightness',
//     'EdgF': 'EdgeFidelity',
//     'EdgI': 'EdgeIntensity',
//     'EdgS': 'EdgeSimplicity',
//     'EdgT': 'EdgeThickness',
//     'EdgW': 'EdgeWidth',
//     'Effc': 'Effect',
//     'EmbC': 'EmbedCMYK',
//     'EmbG': 'EmbedGray',
//     'EmbL': 'EmbedLab',
//     'EmbP': 'EmbedProfiles',
//     'EmbR': 'EmbedRGB',
//     'EmlD': 'EmulsionDown',
//     'EGst': 'EnableGestures',
//     'enab': 'Enabled',
//     'Encd': 'Encoding',
//     'End ': 'End',
//     'EndA': 'EndArrowhead',
//     'EndR': 'EndRamp',
//     'EndS': 'EndSustain',
//     'Engn': 'Engine',
//     'ErsT': 'EraseToHistory',
//     'ErsK': 'EraserKind',
//     'ExcP': 'ExactPoints',
//     'Expr': 'Export',
//     'ExpC': 'ExportClipboard',
//     'Exps': 'Exposure',
//     'Extd': 'Extend',
//     'EQlt': 'ExtendedQuality',
//     'Extn': 'Extension',
//     'ExtQ': 'ExtensionsQuery',
//     'ExtD': 'ExtrudeDepth',
//     'ExtM': 'ExtrudeMaskIncomplete',
//     'ExtR': 'ExtrudeRandom',
//     'ExtS': 'ExtrudeSize',
//     'ExtF': 'ExtrudeSolidFace',
//     'ExtT': 'ExtrudeType',
//     'EyDr': 'EyeDropperSample',
//     'FxCm': 'FPXCompress',
//     'FxQl': 'FPXQuality',
//     'FxSz': 'FPXSize',
//     'FxVw': 'FPXView',
//     'FdT ': 'FadeTo',
//     'FdtS': 'FadeoutSteps',
//     'FlOf': 'Falloff',
//     'Fthr': 'Feather',
//     'FbrL': 'FiberLength',
//     'File': 'File',
//     'FlCr': 'FileCreator',
//     'FlIn': 'FileInfo',
//     'FilR': 'FileReference',
//     'FlSP': 'FileSavePrefs',
//     'FlTy': 'FileType',
//     'flst': 'FilesList',
//     'Fl  ': 'Fill',
//     'FlCl': 'FillColor',
//     'FlNt': 'FillNeutral',
//     'FlPd': 'FilterLayerPersistentData',
//     'FlRs': 'FilterLayerRandomSeed',
//     'Fngr': 'Fingerpainting',
//     'FlrC': 'FlareCenter',
//     'Fltn': 'Flatness',
//     'Fltt': 'Flatten',
//     'FlpV': 'FlipVertical',
//     'Fcs ': 'Focus',
//     'Fldr': 'Folders',
//     'FntD': 'FontDesignAxes',
//     'FntV': 'FontDesignAxesVectors',
//     'FntN': 'FontName',
//     'Scrp': 'FontScript',
//     'FntS': 'FontStyleName',
//     'FntT': 'FontTechnology',
//     'FrcC': 'ForcedColors',
//     'FrgC': 'ForegroundColor',
//     'FrgL': 'ForegroundLevel',
//     'Fmt ': 'Format',
//     'Fwd ': 'Forward',
//     'FrFX': 'FrameFX',
//     'FrmW': 'FrameWidth',
//     'FTcs': 'FreeTransformCenterState',
//     'Frqn': 'Frequency',
//     'From': 'From',
//     'FrmB': 'FromBuiltin',
//     'FrmM': 'FromMode',
//     'FncK': 'FunctionKey',
//     'Fzns': 'Fuzziness',
//     'GCR ': 'GCR',
//     'GFPT': 'GIFColorFileType',
//     'GFCL': 'GIFColorLimit',
//     'GFEC': 'GIFExportCaption',
//     'GFMI': 'GIFMaskChannelIndex',
//     'GFMV': 'GIFMaskChannelInverted',
//     'GFPF': 'GIFPaletteFile',
//     'GFPL': 'GIFPaletteType',
//     'GFCS': 'GIFRequiredColorSpaceType',
//     'GFIT': 'GIFRowOrderType',
//     'GFTC': 'GIFTransparentColor',
//     'GFTB': 'GIFTransparentIndexBlue',
//     'GFTG': 'GIFTransparentIndexGreen',
//     'GFTR': 'GIFTransparentIndexRed',
//     'GFBM': 'GIFUseBestMatch',
//     'Gmm ': 'Gamma',
//     'GmtW': 'GamutWarning',
//     'GnrP': 'GeneralPrefs',
//     'gblA': 'GlobalAngle',
//     'gagl': 'GlobalLightingAngle',
//     'Glos': 'Gloss',
//     'GlwA': 'GlowAmount',
//     'GlwT': 'GlowTechnique',
//     'Grad': 'Gradient',
//     'Grdf': 'GradientFill',
//     // 'Grn ': 'Grain',
//     'Grnt': 'GrainType',
//     'Grns': 'Graininess',
//     'Gry ': 'Gray',
//     'GrBh': 'GrayBehavior',
//     'GrSt': 'GraySetup',
//     'Grn ': 'Green',
//     'GrnB': 'GreenBlackPoint',
//     'greenFloat': 'GreenFloat',
//     'GrnG': 'GreenGamma',
//     'GrnW': 'GreenWhitePoint',
//     'GrnX': 'GreenX',
//     'GrnY': 'GreenY',
//     'GrdC': 'GridColor',
//     'Grds': 'GridCustomColor',
//     'GrdM': 'GridMajor',
//     'Grdn': 'GridMinor',
//     'GrdS': 'GridStyle',
//     'Grdt': 'GridUnits',
//     'Grup': 'Group',
//     'GrtW': 'GroutWidth',
//     'GrwS': 'GrowSelection',
//     'Gdes': 'Guides',
//     'GdsC': 'GuidesColor',
//     'Gdss': 'GuidesCustomColor',
//     'GdPr': 'GuidesPrefs',
//     'GdsS': 'GuidesStyle',
//     'GttW': 'GutterWidth',
//     'HlfF': 'HalftoneFile',
//     'HlfS': 'HalftoneScreen',
//     'HlSz': 'HalftoneSize',
//     'Hlfp': 'HalftoneSpec',
//     'Hrdn': 'Hardness',
//     'HCdH': 'HasCmdHPreference',
//     'Hdr ': 'Header',
//     'Hdln': 'Headline',
//     'Hght': 'Height',
//     'HghA': 'HighlightArea',
//     'hglC': 'HighlightColor',
//     'HghL': 'HighlightLevels',
//     'hglM': 'HighlightMode',
//     'hglO': 'HighlightOpacity',
//     'HghS': 'HighlightStrength',
//     'HstB': 'HistoryBrushSource',
//     'HstP': 'HistoryPrefs',
//     'HsSS': 'HistoryStateSource',
//     'HsSt': 'HistoryStates',
//     'Hrzn': 'Horizontal',
//     'HrzS': 'HorizontalScale',
//     'HstN': 'HostName',
//     'HstV': 'HostVersion',
//     'H   ': 'Hue',
//     'ICCE': 'ICCEngine',
//     'ICCt': 'ICCSetupName',
//     'Idnt': 'ID',
//     'Idle': 'Idle',
//     'ImgB': 'ImageBalance',
//     'Impr': 'Import',
//     'Imps': 'Impressionist',
//     'In  ': 'In',
//     'c@#^': 'Inherits',
//     'InkC': 'InkColors',
//     'Inks': 'Inks',
//     'IrGl': 'InnerGlow',
//     'glwS': 'InnerGlowSource',
//     'IrSh': 'InnerShadow',
//     'Inpt': 'Input',
//     'kIBP': 'InputBlackPoint',
//     'Inmr': 'InputMapRange',
//     'Inpr': 'InputRange',
//     'kIWP': 'InputWhitePoint',
//     'Intn': 'Intensity',
//     'Inte': 'Intent',
//     'IntH': 'InterfaceBevelHighlight',
//     'Intv': 'InterfaceBevelShadow',
//     'IntB': 'InterfaceBlack',
//     'Intd': 'InterfaceBorder',
//     'Intk': 'InterfaceButtonDarkShadow',
//     'Intt': 'InterfaceButtonDownFill',
//     'InBF': 'InterfaceButtonUpFill',
//     'ICBL': 'InterfaceColorBlue2',
//     'ICBH': 'InterfaceColorBlue32',
//     'ICGL': 'InterfaceColorGreen2',
//     'ICGH': 'InterfaceColorGreen32',
//     'ICRL': 'InterfaceColorRed2',
//     'ICRH': 'InterfaceColorRed32',
//     'IntI': 'InterfaceIconFillActive',
//     'IntF': 'InterfaceIconFillDimmed',
//     'Intc': 'InterfaceIconFillSelected',
//     'Intm': 'InterfaceIconFrameActive',
//     // 'Intr': 'InterfaceIconFrameDimmed',
//     'IntS': 'InterfaceIconFrameSelected',
//     'IntP': 'InterfacePaletteFill',
//     'IntR': 'InterfaceRed',
//     'IntT': 'InterfaceToolTipBackground',
//     'ITTT': 'InterfaceToolTipText',
//     'ITBg': 'InterfaceTransparencyBackground',
//     'ITFg': 'InterfaceTransparencyForeground',
//     'IntW': 'InterfaceWhite',
//     // 'Intr': 'Interlace',
//     'IntC': 'InterlaceCreateType',
//     'IntE': 'InterlaceEliminateType',
//     // 'Intr': 'Interpolation',
//     'IntM': 'InterpolationMethod',
//     'Invr': 'Invert',
//     'InvM': 'InvertMask',
//     'InvS': 'InvertSource2',
//     'InvT': 'InvertTexture',
//     'IsDr': 'IsDirty',
//     'ItmI': 'ItemIndex',
//     'JPEQ': 'JPEGQuality',
//     'Krng': 'Kerning',
//     'Kywd': 'Keywords',
//     'Knd ': 'Kind',
//     'LTnm': 'LUTAnimation',
//     'LZWC': 'LZWCompression',
//     'Lbls': 'Labels',
//     'Lnds': 'Landscape',
//     'LstT': 'LastTransform',
//     'Lyr ': 'Layer',
//     'Lefx': 'LayerEffects',
//     'lfxv': 'LayerFXVisible',
//     'LyrI': 'LayerID',
//     'LyrN': 'LayerName',
//     'Lyrs': 'Layers',
//     'Ldng': 'Leading',
//     'Left': 'Left',
//     'lSNs': 'LegacySerialString',
//     // 'Lngt': 'Length',
//     'Lns ': 'Lens',
//     'Lvl ': 'Level',
//     'Lvls': 'Levels',
//     'LgDr': 'LightDark',
//     'LghD': 'LightDirection',
//     'LghI': 'LightIntensity',
//     'LghP': 'LightPosition',
//     'LghS': 'LightSource',
//     'LghT': 'LightType',
//     'LghG': 'LightenGrout',
//     'Lght': 'Lightness',
//     'Line': 'Line',
//     'lnkE': 'LinkEnable',
//     'LnkL': 'LinkedLayerIDs',
//     'Lald': 'LocalLightingAltitude',
//     'lagl': 'LocalLightingAngle',
//     'LclR': 'LocalRange',
//     'Lctn': 'Location',
//     'Log ': 'Log',
//     'kLog': 'Logarithmic',
//     'LwCs': 'LowerCase',
//     'Lmnc': 'Luminance',
//     'Mgnt': 'Magenta',
//     'MkVs': 'MakeVisible',
//     'Mfov': 'ManipulationFOV',
//     'MpBl': 'MapBlack',
//     'Mpng': 'Mapping',
//     'MpgS': 'MappingShape',
//     'Mtrl': 'Material',
//     'Mtrx': 'Matrix',
//     'MttC': 'MatteColor',
//     'Mxm ': 'Maximum',
//     'MxmS': 'MaximumStates',
//     'MmrU': 'MemoryUsagePercent',
//     'Mrge': 'Merge',
//     'Mrgd': 'Merged',
//     'Msge': 'Message',
//     'Mthd': 'Method',
//     'MztT': 'MezzotintType',
//     'Mdpn': 'Midpoint',
//     'MdtL': 'MidtoneLevels',
//     'Mnm ': 'Minimum',
//     'MsmC': 'MismatchCMYK',
//     'MsmG': 'MismatchGray',
//     'MsmR': 'MismatchRGB',
//     'Md  ': 'Mode',
//     'Mnch': 'Monochromatic',
//     'MvT ': 'MoveTo',
//     'Nm  ': 'Name',
//     'Ngtv': 'Negative',
//     'Nw  ': 'New',
//     'Nose': 'Noise',
//     'NnIm': 'NonImageData',
//     'NnLn': 'NonLinear',
//     'null': 'Null',
//     'Nm L': 'NumLights',
//     'Nmbr': 'Number',
//     'NCch': 'NumberOfCacheLevels',
//     'NC64': 'NumberOfCacheLevels64',
//     'NmbO': 'NumberOfChannels',
//     'NmbC': 'NumberOfChildren',
//     'NmbD': 'NumberOfDocuments',
//     'NmbG': 'NumberOfGenerators',
//     // 'NmbL': 'NumberOfLayers',
//     // 'NmbL': 'NumberOfLevels',
//     'NmbP': 'NumberOfPaths',
//     'NmbR': 'NumberOfRipples',
//     'NmbS': 'NumberOfSiblings',
//     'ObjN': 'ObjectName',
//     'Ofst': 'Offset',
//     'Sftt': 'OldSmallFontType',
//     'On  ': 'On',
//     'Opct': 'Opacity',
//     'Optm': 'Optimized',
//     'Ornt': 'Orientation',
//     'OrgH': 'OriginalHeader',
//     'OrgT': 'OriginalTransmissionReference',
//     'OthC': 'OtherCursors',
//     'OrGl': 'OuterGlow',
//     'Otpt': 'Output',
//     'kOBP': 'OutputBlackPoint',
//     'kOWP': 'OutputWhitePoint',
//     'OvrC': 'OverprintColors',
//     'OvrO': 'OverrideOpen',
//     'ObrP': 'OverridePrinter',
//     'Ovrd': 'OverrideSave',
//     'PNGf': 'PNGFilter',
//     'PGIT': 'PNGInterlaceType',
//     'PMpf': 'PageFormat',
//     'PgNm': 'PageNumber',
//     'PgPs': 'PagePosition',
//     'PgSt': 'PageSetup',
//     'PnCK': 'PaintCursorKind',
//     'PntT': 'PaintType',
//     'PntC': 'PaintingCursors',
//     'Plt ': 'Palette',
//     'PltF': 'PaletteFile',
//     'PprB': 'PaperBrightness',
//     'PrIn': 'ParentIndex',
//     'PrNm': 'ParentName',
//     'Path': 'Path',
//     'PthC': 'PathContents',
//     'PthN': 'PathName',
//     'Pttn': 'Pattern',
//     'Pncl': 'PencilWidth',
//     'Prsp': 'PerspectiveIndex',
//     'Phsp': 'Phosphors',
//     'PckI': 'PickerID',
//     'Pckr': 'PickerKind',
//     'PPSz': 'PixelPaintSize',
//     'Pltf': 'Platform',
//     'PlgF': 'PluginFolder',
//     'PlgP': 'PluginPrefs',
//     'Pts ': 'Points',
//     'Pstn': 'Position',
//     'PstS': 'PostScriptColor',
//     'Pstr': 'Posterization',
//     'PrdC': 'PredefinedColors',
//     'PrfB': 'PreferBuiltin',
//     'Prfr': 'Preferences',
//     'PrsA': 'PreserveAdditional',
//     'PrsL': 'PreserveLuminosity',
//     'PrsT': 'PreserveTransparency',
//     'Prs ': 'Pressure',
//     'Prvw': 'Preview',
//     'PrvK': 'PreviewCMYK',
//     'PrvF': 'PreviewFullSize',
//     'PrvI': 'PreviewIcon',
//     'PrvM': 'PreviewMacThumbnail',
//     'PrvW': 'PreviewWinThumbnail',
//     'PrvQ': 'PreviewsQuery',
//     'PMps': 'PrintSettings',
//     'PrfS': 'ProfileSetup',
//     'PrvS': 'ProvinceState',
//     'Qlty': 'Quality',
//     'QucM': 'QuickMask',
//     'RGBS': 'RGBSetup',
//     'Rds ': 'Radius',
//     'RndS': 'RandomSeed',
//     'Rt  ': 'Ratio',
//     'Rcnf': 'RecentFiles',
//     'Rd  ': 'Red',
//     'RdBl': 'RedBlackPoint',
//     'redFloat': 'RedFloat',
//     'RdGm': 'RedGamma',
//     'RdWh': 'RedWhitePoint',
//     'RdX ': 'RedX',
//     'RdY ': 'RedY',
//     'RgsM': 'RegistrationMarks',
//     'Rltv': 'Relative',
//     'Rlf ': 'Relief',
//     'Rfid': 'RenderFidelity',
//     'Rsmp': 'Resample',
//     'RWOZ': 'ResizeWindowsOnZoom',
//     'Rslt': 'Resolution',
//     'RsrI': 'ResourceID',
//     'Rspn': 'Response',
//     'RtnH': 'RetainHeader',
//     'Rvrs': 'Reverse',
//     'Rght': 'Right',
//     'RplM': 'RippleMagnitude',
//     'RplS': 'RippleSize',
//     'Rtt ': 'Rotate',
//     'Rndn': 'Roundness',
//     'RlrH': 'RulerOriginH',
//     'RlrV': 'RulerOriginV',
//     'RlrU': 'RulerUnits',
//     // 'Strt': 'Saturation',
//     'SvAn': 'SaveAndClose',
//     'SvCm': 'SaveComposite',
//     'PltL': 'SavePaletteLocations',
//     'SvPt': 'SavePaths',
//     'SvPy': 'SavePyramids',
//     'Svng': 'Saving',
//     'Scl ': 'Scale',
//     'SclH': 'ScaleHorizontal',
//     'SclV': 'ScaleVertical',
//     'Scln': 'Scaling',
//     'Scns': 'Scans',
//     'ScrD': 'ScratchDisks',
//     'ScrF': 'ScreenFile',
//     'ScrT': 'ScreenType',
//     'Sprt': 'Separations',
//     'SrlS': 'SerialString',
//     // 'ShdI': 'ShadingIntensity',
//     'ShdN': 'ShadingNoise',
//     'ShdS': 'ShadingShape',
//     'sdwC': 'ShadowColor',
//     // 'ShdI': 'ShadowIntensity',
//     'ShdL': 'ShadowLevels',
//     'sdwM': 'ShadowMode',
//     'sdwO': 'ShadowOpacity',
//     'Shp ': 'Shape',
//     'Shrp': 'Sharpness',
//     'ShrE': 'ShearEd',
//     'ShrP': 'ShearPoints',
//     'ShrS': 'ShearSt',
//     'ShfK': 'ShiftKey',
//     'ShKT': 'ShiftKeyToolSwitch',
//     'ShrN': 'ShortNames',
//     'ShwE': 'ShowEnglishFontNames',
//     'SwMC': 'ShowMenuColors',
//     'ShwT': 'ShowToolTips',
//     'ShTr': 'ShowTransparency',
//     'Sz  ': 'SizeKey',
//     'Skew': 'Skew',
//     'Sfts': 'SmallFontType',
//     'SmBM': 'SmartBlurMode',
//     'SmBQ': 'SmartBlurQuality',
//     'Smoo': 'Smooth',
//     'Smth': 'Smoothness',
//     'SnpI': 'SnapshotInitial',
//     'SfCl': 'SoftClip',
//     'Sftn': 'Softness',
//     'SoFi': 'SolidFill',
//     'Srce': 'Source',
//     'Src2': 'Source2',
//     'SrcM': 'SourceMode',
//     'Spcn': 'Spacing',
//     'SpcI': 'SpecialInstructions',
//     'SphM': 'SpherizeMode',
//     'Spot': 'Spot',
//     'SprR': 'SprayRadius',
//     'SqrS': 'SquareSize',
//     'Srcl': 'SrcBlackMax',
//     'SrcB': 'SrcBlackMin',
//     'Srcm': 'SrcWhiteMax',
//     'SrcW': 'SrcWhiteMin',
//     // 'Strt': 'Start',
//     'StrA': 'StartArrowhead',
//     'Stte': 'State',
//     'srgh': 'Strength',
//     'srgR': 'StrengthRatio',
//     'Strg': 'Strength_PLUGIN',
//     'StDt': 'StrokeDetail',
//     'SDir': 'StrokeDirection',
//     'StrL': 'StrokeLength',
//     'StrP': 'StrokePressure',
//     'StrS': 'StrokeSize',
//     'StrW': 'StrokeWidth',
//     'Styl': 'Style',
//     'Stys': 'Styles',
//     'StlC': 'StylusIsColor',
//     'StlO': 'StylusIsOpacity',
//     'StlP': 'StylusIsPressure',
//     'StlS': 'StylusIsSize',
//     'SbpL': 'SubPathList',
//     'SplC': 'SupplementalCategories',
//     'SstI': 'SystemInfo',
//     'SstP': 'SystemPalette',
//     // 'null': 'Target',
//     'Trgp': 'TargetPath',
//     'TrgP': 'TargetPathIndex',
//     // 'Lngt': 'TermLength',
//     'Txt ': 'Text',
//     // 'TxtC': 'TextClickPoint',
//     'TxtD': 'TextData',
//     'TxtS': 'TextStyle',
//     'Txtt': 'TextStyleRange',
//     'Txtr': 'Texture',
//     // 'TxtC': 'TextureCoverage',
//     'TxtF': 'TextureFile',
//     'TxtT': 'TextureType',
//     'Thsh': 'Threshold',
//     'TlNm': 'TileNumber',
//     'TlOf': 'TileOffset',
//     'TlSz': 'TileSize',
//     'Ttl ': 'Title',
//     'T   ': 'To',
//     'TBl ': 'ToBuiltin',
//     'ToLk': 'ToLinked',
//     'TMd ': 'ToMode',
//     'TglO': 'ToggleOthers',
//     'Tlrn': 'Tolerance',
//     'Top ': 'Top',
//     'TtlL': 'TotalLimit',
//     'Trck': 'Tracking',
//     'TrnF': 'TransferFunction',
//     // 'TrnS': 'TransferSpec',
//     'Trns': 'Transparency',
//     // 'TrnG': 'TransparencyGrid',
//     'TrnC': 'TransparencyGridColors',
//     // 'TrnG': 'TransparencyGridSize',
//     'TrnP': 'TransparencyPrefs',
//     // 'TrnS': 'TransparencyShape',
//     'TrnI': 'TransparentIndex',
//     'TrnW': 'TransparentWhites',
//     'Twst': 'Twist',
//     'Type': 'Type',
//     'UC  ': 'UCA',
//     'URL ': 'URL',
//     'UndA': 'UndefinedArea',
//     'Undl': 'Underline',
//     'UntP': 'UnitsPrefs',
//     'Untl': 'Untitled',
//     'UppY': 'UpperY',
//     'Urgn': 'Urgency',
//     'AcrS': 'UseAccurateScreens',
//     'AdPl': 'UseAdditionalPlugins',
//     'UsCc': 'UseCacheForHistograms',
//     'UsCr': 'UseCurves',
//     'UsDf': 'UseDefault',
//     'uglg': 'UseGlobalAngle',
//     'UsIC': 'UseICCProfile',
//     'UsMs': 'UseMask',
//     'UsrM': 'UserMaskEnabled',
//     'Usrs': 'UserMaskLinked',
//     'Usng': 'Using',
//     'Vl  ': 'Value',
//     'Vrnc': 'Variance',
//     'Vct0': 'Vector0',
//     'Vct1': 'Vector1',
//     'VctC': 'VectorColor',
//     'VrsF': 'VersionFix',
//     'VrsM': 'VersionMajor',
//     'VrsN': 'VersionMinor',
//     'Vrtc': 'Vertical',
//     'VrtS': 'VerticalScale',
//     'Vdlp': 'VideoAlpha',
//     'Vsbl': 'Visible',
//     'WtcS': 'WatchSuspension',
//     'watr': 'Watermark',
//     'Wvtp': 'WaveType',
//     'WLMx': 'WavelengthMax',
//     'WLMn': 'WavelengthMin',
//     'WbdP': 'WebdavPrefs',
//     'Wtdg': 'WetEdges',
//     'What': 'What',
//     'WhtC': 'WhiteClip',
//     'WhtI': 'WhiteIntensity',
//     'WhHi': 'WhiteIsHigh',
//     'WhtL': 'WhiteLevel',
//     'WhtP': 'WhitePoint',
//     'WhPt': 'WholePath',
//     'Wdth': 'Width',
//     'WndM': 'WindMethod',
//     'With': 'With',
//     'WrPt': 'WorkPath',
//     'WrkP': 'WorkPathIndex',
//     'X   ': 'X',
//     'Y   ': 'Y',
//     'Ylw ': 'Yellow',
//     'ZZTy': 'ZigZagType',
//     'Alis': '_3DAntiAlias',
// };
