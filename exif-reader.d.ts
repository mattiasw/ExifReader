/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// <reference types="node" />
/// <reference lib="es2017.sharedmemory" />

export as namespace ExifReader;

type FileTypeValue =
    | 'tiff'
    | 'jpeg'
    | 'png'
    | 'heic'
    | 'avif'
    | 'jxl'
    | 'webp'
    | 'gif'
    | 'xml';

type FileTypeDescription =
    | 'TIFF'
    | 'JPEG'
    | 'PNG'
    | 'HEIC'
    | 'AVIF'
    | 'JPEG XL'
    | 'WebP'
    | 'GIF'
    | 'XML';

interface FileTypeTag {
    value: FileTypeValue,
    description: FileTypeDescription
}

interface FileTags {
    'FileType'?: FileTypeTag,
    'Bits Per Sample'?: NumberFileTag,
    'Image Height'?: NumberFileTag,
    'Image Width'?: NumberFileTag,
    'Color Components'?: NumberFileTag,
    'Subsampling'?: NumberArrayFileTag
}

interface JfifTags {
    'JFIF Version'?: NumberFileTag,
    'Resolution Unit'?: JfifResolutionUnitTag,
    'XResolution'?: NumberFileTag,
    'YResolution'?: NumberFileTag,
    'JFIF Thumbnail Width'?: NumberFileTag,
    'JFIF Thumbnail Height'?: NumberFileTag,
    'JFIF Thumbnail'?: JfifThumbnailTag
}

interface JfifResolutionUnitTag {
    value: number,
    description: 'None' | 'inches' | 'cm' | 'Unknown'
}

interface JfifThumbnailTag {
    value: ArrayBuffer | SharedArrayBuffer | Buffer,
    description: '<24-bit RGB pixel data>'
}

interface PngFileTags {
    'Image Width'?: NumberFileTag,
    'Image Height'?: NumberFileTag,
    'Bit Depth'?: NumberFileTag,
    'Color Type'?: {
        value: number,
        description: 'Grayscale' | 'RGB' | 'Palette' | 'Grayscale with Alpha' | 'RGB with Alpha' | 'Unknown'
    },
    'Compression'?: {
        value: number,
        description: 'Deflate/Inflate' | 'Unknown'
    },
    'Filter'?: {
        value: number,
        description: 'Adaptive' | 'Unknown'
    },
    'Interlace'?: {
        value: number,
        description: 'Noninterlaced' | 'Adam7 Interlace' | 'Unknown'
    }
}

interface PngPhysTags {
    'Pixels Per Unit X'?: NumberFileTag,
    'Pixels Per Unit Y'?: NumberFileTag,
    'Pixel Units'?: {
        value: number,
        description: 'meters' | 'Unknown'
    },
    'Modify Date'?: NumberArrayFileTag
}

interface PngTag {
    description: string,
    value: string | number
}

type PngTags = PngFileTags & PngPhysTags & {
    [name: string]: PngTag
}

interface PngTextTag {
    description: string,
    value: string
}

interface PngTextTags {
    [name: string]: PngTextTag
}

interface RiffTags {
    'Alpha'?: {
        value: 0 | 1,
        description: 'No' | 'Yes'
    },
    'Animation'?: {
        value: 0 | 1,
        description: 'No' | 'Yes'
    },
    'ImageWidth'?: {
        value: number,
        description: string
    },
    'ImageHeight'?: {
        value: number,
        description: string
    },
}

interface GifTags {
    'GIF Version': {
        value: '87a' | '89a',
        description: '87a' | '89a'
    },
    'Image Width'?: {
        value: number,
        description: string
    },
    'Image Height'?: {
        value: number,
        description: string
    },
    'Global Color Map'?: {
        value: 0 | 1,
        description: 'No' | 'Yes'
    },
    'Bits Per Pixel'?: {
        value: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
        description: string
    },
    'Color Resolution Depth'?: {
        value: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
        description: string
    },
}

interface NumberFileTag {
    description: string,
    value: number
}

interface NumberArrayFileTag {
    description: string,
    value: Array<number>
}

type TypedTag<V, C = V, D = string> = {
    id: number,
    description: D,
    computed?: C,
    value: V
}

type RationalTag = TypedTag<[number, number], number | null>

type RationalArrayTag = TypedTag<[number, number][], (number | null)[]>

type GpsDecimalCoordinateTag =
    | TypedTag<
        [[number, number], [number, number], [number, number]],
        [number | null, number | null, number | null],
        number
    >
    | TypedTag<[number, number], number | null, number>
    | TypedTag<[number, number][], (number | null)[], number>

type NumberTag = TypedTag<number>;

type NumberArrayTag = TypedTag<number[]>

type StringArrayTag = TypedTag<string[], string | string[]>

type AnyFieldTypeTag = NumberTag | NumberArrayTag | RationalTag | RationalArrayTag | StringArrayTag

type StringTag = TypedTag<string>;

interface ValueTag {
    description: string,
    value: string
}

interface XmpTag {
    value: string | XmpTag[] | XmpTags,
    attributes: {
        [name: string]: string
    },
    description: string
}

interface XmpTags {
    [name: string]: XmpTag
}

interface ThumbnailTags {
    type: 'image/jpeg',
    image: ArrayBuffer | SharedArrayBuffer | Buffer,
    base64: string,
    Compression: NumberTag,
    XResolution: RationalTag,
    YResolution: RationalTag,
    ResolutionUnit: NumberTag,
    JPEGInterchangeFormat?: NumberTag,
    JPEGInterchangeFormatLength?: NumberTag,
    ImageWidth?: NumberTag,
    ImageLength?: NumberTag,
    YCbCrPositioning?: NumberTag,
    Orientation?: NumberTag,
    PhotometricInterpretation?: NumberTag,
    StripOffsets?: NumberTag | NumberArrayTag,
    SamplesPerPixel?: NumberTag,
    RowsPerStrip?: NumberTag,
    StripByteCounts?: NumberTag | NumberArrayTag
}

export interface ExpandedTags {
    file?: FileTags,
    jfif?: JfifTags,
    pngFile?: PngFileTags,
    pngText?: PngTextTags,
    png?: PngTags,
    exif?: ExifTags,
    iptc?: ExifTags,
    xmp?: {
        /**
         * The raw, unsanitized XMP packet as it appears in the image, decoded
         * as text. Treat it as untrusted: escape or sanitize it before
         * inserting it into a page as HTML to avoid cross-site scripting.
         *
         * Tag filtering does not remove the values of excluded XMP tags from
         * `_raw`; exclude `_raw` too.
         */
        _raw: string
    } & XmpTags,
    icc?: IccTags,
    mpf?: MPFTags,
    riff?: RiffTags,
    gif?: GifTags,
    /** @deprecated Use `thumbnail`. `Thumbnail` is removed in v5. */
    Thumbnail?: ThumbnailTags,
    thumbnail?: ThumbnailTags,
    gps?: GpsTags
    photoshop?: PhotoshopTags;
    makerNotes?: CanonTags & PentaxTags;
    composite?: CompositeTags;
    metadataRange?: MetadataRange;
}

export type MetadataBlockType =
    | 'exif'
    | 'iptc'
    | 'xmp'
    | 'icc'
    | 'mpf'
    | 'mpfImage'
    | 'jfif'
    | 'file'
    | 'png'
    | 'riff'
    | 'gif';

export interface MetadataBlock {
    type: MetadataBlockType,
    start: number,
    end: number,
}

export interface MetadataRange {
    start: number,
    end: number,
    complete: boolean,
    blocks: MetadataBlock[],
    // Only present when length: 'auto' was used:
    buffer?: ArrayBuffer | SharedArrayBuffer | Buffer,
    fetched?: number,
    requests?: number,
}

interface GpsTags {
    Latitude?: number,
    Longitude?: number,
    Altitude?: number
}

interface MPFImageTags {
    ImageFlags: {
        value: number[],
        description: string
    },
    ImageFormat: {
        value: number,
        description: string
    },
    ImageType: {
        value: number,
        description: string
    },
    ImageSize: {
        value: number,
        description: string
    },
    ImageOffset: {
        value: number,
        description: string
    },
    DependentImage1EntryNumber: {
        value: number,
        description: string
    },
    DependentImage2EntryNumber: {
        value: number,
        description: string
    },
    image: ArrayBuffer | SharedArrayBuffer | Buffer,
    base64: string
}

type MPFTags = Pick<ExifTags, 'MPFVersion' | 'NumberOfImages' | 'MPEntry' | 'ImageUIDList' | 'TotalFrames' | 'Images'>;

interface PhotoshopTags {
    // CaptionDigest: StringTag;
    // PrintInformation: StringTag;
    // PrintStyle: StringTag;
    PathInformation: StringTag;
    ClippingPathName: StringTag;
}

interface CanonTags {
    AutoRotate?: {
        value: number;
        description: 'None' | 'Rotate 90 CW' | 'Rotate 180' | 'Rotate 270 CW' | 'Unknown';
    };
    LensType?: {
        value: number;
        description: string;
    };
    LensModel?: {
        value: string[];
        description: string;
    };
}

interface PentaxTags {
    PentaxVersion?: {
        value: number[];
        description: string;
    };
    PentaxModelID?: {
        value: number;
        description: string;
    };
    CameraOrientation?: {
        value: number;
        description: 'Horizontal (normal)' | 'Rotate 270 CW' | 'Rotate 180' | 'Rotate 90 CW' | 'Upwards' | 'Downwards' | 'Unknown';
    };
    RollAngle?: {
        value: number;
        description: string;
    };
    PitchAngle?: {
        value: number;
        description: string;
    };
}

interface CompositeTags {
    FocalLength35efl?: {
        value: number,
        description: string,
    }
    ScaleFactorTo35mmEquivalent?: {
        value: number,
        description: string,
    },
    FieldOfView?: {
        value: number,
        description: string,
    }
}

// Minimal DOM-like parser interface for XML parsing.
interface XmlDomParser {
    parseFromString(xml: string, mimeType: string): unknown;
}

type TagSelectorWithId = string | number;
type TagSelectorNameOnly = string;

type TagFilterGroupWithId = boolean | TagSelectorWithId[];
type TagFilterGroupNameOnly = boolean | TagSelectorNameOnly[];

export type IncludeTagsOptions = {
    exif?: TagFilterGroupWithId,
    iptc?: TagFilterGroupWithId,
    xmp?: TagFilterGroupNameOnly,
    icc?: TagFilterGroupNameOnly,
    photoshop?: TagFilterGroupWithId,
    makerNotes?: TagFilterGroupWithId,
    mpf?: TagFilterGroupWithId,
    file?: TagFilterGroupNameOnly,
    jfif?: TagFilterGroupNameOnly,
    png?: TagFilterGroupNameOnly,
    riff?: TagFilterGroupNameOnly,
    gif?: TagFilterGroupNameOnly,
    gps?: TagFilterGroupNameOnly,
    composite?: TagFilterGroupNameOnly,
    thumbnail?: TagFilterGroupNameOnly,
};

export type ExcludeTagsOptions = IncludeTagsOptions;

type DecompressFunction = (data: Uint8Array, options: {
    /**
     * The most bytes the function may produce: one more than what is left of
     * the `maxDecompressedSize` total of the current `load()` or `loadView()`
     * call, at most 2^30 - 1.
     */
    maxOutputLength: number,
}) => Promise<Uint8Array | ArrayBuffer> | Uint8Array | ArrayBuffer;

type DecompressOptions = {
    brotli?: DecompressFunction,
    deflate?: DecompressFunction,
    maxDecompressedSize?: number,
};

type CommonOptions = {
    includeUnknown?: boolean,
    computed?: boolean,
    domParser?: XmlDomParser,
    includeTags?: IncludeTagsOptions,
    excludeTags?: ExcludeTagsOptions,
    decompress?: DecompressOptions,
};

type ExpandedOnly = {expanded: true, includeOffsets?: boolean};
type FlatOnly = {expanded?: false, includeOffsets?: false};

type AutoLengthOptions = {
    length: 'auto',
    expanded: true,
    includeOffsets: true,
    async?: boolean,
};

export function load(data: ArrayBuffer | SharedArrayBuffer | Buffer | ArrayBufferView): Tags;
export function load(data: ArrayBuffer | SharedArrayBuffer | Buffer | ArrayBufferView, options: CommonOptions & AutoLengthOptions): Promise<ExpandedTags>;
export function load(data: ArrayBuffer | SharedArrayBuffer | Buffer | ArrayBufferView, options: CommonOptions & ExpandedOnly & {length?: number, async?: false}): ExpandedTags;
export function load(data: ArrayBuffer | SharedArrayBuffer | Buffer | ArrayBufferView, options: CommonOptions & FlatOnly & {length?: number, async?: false}): Tags;
export function load(data: ArrayBuffer | SharedArrayBuffer | Buffer | ArrayBufferView, options: CommonOptions & ExpandedOnly & {length?: number, async: true}): Promise<ExpandedTags>;
export function load(data: ArrayBuffer | SharedArrayBuffer | Buffer | ArrayBufferView, options: CommonOptions & FlatOnly & {length?: number, async: true}): Promise<Tags>;
/**
 * Security: a string argument is treated as a URL or a local file path, so
 * `load()` will make a network request or read from the file system. Never pass
 * an untrusted or user-controlled string, since it enables server-side request
 * forgery (SSRF) and reads of arbitrary local files. For untrusted image data,
 * pass the bytes (`ArrayBuffer`, a typed array such as `Uint8Array` or
 * `Buffer`, or `File`) instead.
 */
export function load(data: string | File): Promise<Tags>;
/**
 * Security: a string argument is treated as a URL or a local file path, so
 * `load()` will make a network request or read from the file system. Never pass
 * an untrusted or user-controlled string, since it enables server-side request
 * forgery (SSRF) and reads of arbitrary local files. For untrusted image data,
 * pass the bytes (`ArrayBuffer`, a typed array such as `Uint8Array` or
 * `Buffer`, or `File`) instead.
 */
export function load(data: string | File, options: CommonOptions & AutoLengthOptions): Promise<ExpandedTags>;
/**
 * Security: a string argument is treated as a URL or a local file path, so
 * `load()` will make a network request or read from the file system. Never pass
 * an untrusted or user-controlled string, since it enables server-side request
 * forgery (SSRF) and reads of arbitrary local files. For untrusted image data,
 * pass the bytes (`ArrayBuffer`, a typed array such as `Uint8Array` or
 * `Buffer`, or `File`) instead.
 */
export function load(data: string | File, options: CommonOptions & ExpandedOnly & {length?: number, async?: boolean }): Promise<ExpandedTags>;
/**
 * Security: a string argument is treated as a URL or a local file path, so
 * `load()` will make a network request or read from the file system. Never pass
 * an untrusted or user-controlled string, since it enables server-side request
 * forgery (SSRF) and reads of arbitrary local files. For untrusted image data,
 * pass the bytes (`ArrayBuffer`, a typed array such as `Uint8Array` or
 * `Buffer`, or `File`) instead.
 */
export function load(data: string | File, options: CommonOptions & FlatOnly & {length?: number, async?: boolean }): Promise<Tags>;
export function loadView(data: DataView): Tags;
export function loadView(data: DataView, options: CommonOptions & ExpandedOnly & {async?: false}): ExpandedTags;
export function loadView(data: DataView, options: CommonOptions & FlatOnly & {async?: false}): Tags;
export function loadView(data: DataView, options: CommonOptions & ExpandedOnly & {async: true}): Promise<ExpandedTags>;
export function loadView(data: DataView, options: CommonOptions & FlatOnly & {async: true}): Promise<Tags>;

export namespace errors {
    export class MetadataMissingError extends Error {}
    export class UnsupportedFormatError extends Error {}
}

interface ExifTags {
    // Interoperability tags
    'InteroperabilityIndex'?: StringArrayTag,
    'InteroperabilityVersion'?: AnyFieldTypeTag,
    'RelatedImageFileFormat'?: AnyFieldTypeTag,
    'RelatedImageWidth'?: AnyFieldTypeTag,
    'RelatedImageHeight'?: AnyFieldTypeTag,

    // 0th IFD tags
    'ProcessingSoftware'?: AnyFieldTypeTag,
    'SubfileType'?: NumberTag,
    'OldSubfileType'?: NumberTag,
    'ImageWidth'?: NumberTag,
    'ImageLength'?: NumberTag,
    'BitsPerSample'?: NumberTag | NumberArrayTag,
    'Compression'?: NumberTag,
    'PhotometricInterpretation'?: NumberTag,
    'Thresholding'?: NumberTag,
    'CellWidth'?: NumberTag,
    'CellLength'?: NumberTag,
    'FillOrder'?: NumberTag,
    'DocumentName'?: StringArrayTag,
    'ImageDescription'?: StringArrayTag,
    'Make'?: StringArrayTag,
    'Model'?: StringArrayTag,
    'StripOffsets'?: NumberTag | NumberArrayTag,
    'Orientation'?: NumberTag,
    'SamplesPerPixel'?: NumberTag,
    'RowsPerStrip'?: NumberTag,
    'StripByteCounts'?: NumberTag | NumberArrayTag,
    'MinSampleValue'?: NumberTag | NumberArrayTag,
    'MaxSampleValue'?: NumberTag | NumberArrayTag,
    'XResolution'?: RationalTag | NumberFileTag, // Also in JFIF tags.
    'YResolution'?: RationalTag | NumberFileTag, // Also in JFIF tags.
    'PlanarConfiguration'?: NumberTag,
    'PageName'?: StringArrayTag,
    'XPosition'?: RationalTag,
    'YPosition'?: RationalTag,
    'GrayResponseUnit'?: NumberTag,
    'ResolutionUnit'?: NumberTag,
    'PageNumber'?: NumberArrayTag,
    'TransferFunction'?: NumberArrayTag,
    'Software'?: StringArrayTag,
    'DateTime'?: StringArrayTag,
    'Artist'?: StringArrayTag,
    'HostComputer'?: StringArrayTag,
    'Predictor'?: NumberTag,
    'WhitePoint'?: RationalArrayTag,
    'PrimaryChromaticities'?: RationalArrayTag,
    'HalftoneHints'?: NumberArrayTag,
    'TileWidth'?: NumberTag,
    'TileLength'?: NumberTag,
    'A100DataOffset'?: AnyFieldTypeTag,
    'InkSet'?: NumberTag,
    'TargetPrinter'?: StringArrayTag,
    'ExtraSamples'?: NumberTag | NumberArrayTag,
    'SampleFormat'?: NumberTag | NumberArrayTag,
    'JPEGInterchangeFormat'?: NumberTag,
    'JPEGInterchangeFormatLength'?: NumberTag,
    'YCbCrCoefficients'?: RationalArrayTag,
    'YCbCrSubSampling'?: NumberArrayTag,
    'YCbCrPositioning'?: NumberTag,
    'ReferenceBlackWhite'?: RationalArrayTag,
    'ApplicationNotes'?: AnyFieldTypeTag,
    'Rating'?: AnyFieldTypeTag,
    'RatingPercent'?: AnyFieldTypeTag,
    'Copyright'?: StringArrayTag,
    'PixelScale'?: NumberArrayTag,
    'IPTC-NAA'?: NumberArrayTag | StringArrayTag,
    'IntergraphMatrix'?: AnyFieldTypeTag,
    'ModelTiePoint'?: NumberArrayTag,
    'SEMInfo'?: AnyFieldTypeTag,
    'ModelTransform'?: NumberArrayTag,
    'PhotoshopSettings'?: AnyFieldTypeTag,
    'Exif IFD Pointer'?: NumberTag,
    'ICC_Profile'?: NumberTag | NumberArrayTag,
    'GeoTiffDirectory'?: NumberArrayTag,
    'GeoTiffDoubleParams'?: NumberTag | NumberArrayTag,
    'GeoTiffAsciiParams'?: StringArrayTag,
    'GPS Info IFD Pointer'?: NumberTag,
    'XPTitle'?: AnyFieldTypeTag,
    'XPComment'?: AnyFieldTypeTag,
    'XPAuthor'?: AnyFieldTypeTag,
    'XPKeywords'?: AnyFieldTypeTag,
    'XPSubject'?: AnyFieldTypeTag,
    'GDALMetadata'?: AnyFieldTypeTag,
    'GDALNoData'?: AnyFieldTypeTag,
    'PrintIM'?: AnyFieldTypeTag,
    'DNGVersion'?: NumberArrayTag,
    'DNGBackwardVersion'?: NumberArrayTag,
    'UniqueCameraModel'?: StringArrayTag,
    'LocalizedCameraModel'?: StringArrayTag | NumberTag | NumberArrayTag,
    'ColorMatrix1'?: RationalArrayTag,
    'ColorMatrix2'?: RationalArrayTag,
    'CameraCalibration1'?: RationalTag | RationalArrayTag,
    'CameraCalibration2'?: RationalTag | RationalArrayTag,
    'ReductionMatrix1'?: RationalArrayTag,
    'ReductionMatrix2'?: RationalArrayTag,
    'AnalogBalance'?: RationalTag | RationalArrayTag,
    'AsShotNeutral'?: NumberTag | NumberArrayTag | RationalTag | RationalArrayTag,
    'AsShotWhiteXY'?: RationalArrayTag,
    'BaselineExposure'?: RationalTag,
    'BaselineNoise'?: RationalTag,
    'BaselineSharpness'?: RationalTag,
    'LinearResponseLimit'?: RationalTag,
    'CameraSerialNumber'?: StringArrayTag,
    'DNGLensInfo'?: RationalArrayTag,
    'ShadowScale'?: RationalTag,
    'MakerNoteSafety'?: NumberTag,
    'CalibrationIlluminant1'?: NumberTag,
    'CalibrationIlluminant2'?: NumberTag,
    'RawDataUniqueID'?: NumberArrayTag,
    'OriginalRawFileName'?: StringArrayTag | NumberTag | NumberArrayTag,
    'OriginalRawFileData'?: NumberTag | NumberArrayTag,
    'AsShotICCProfile'?: NumberTag | NumberArrayTag,
    'AsShotPreProfileMatrix'?: RationalTag | RationalArrayTag,
    'CurrentICCProfile'?: NumberTag | NumberArrayTag,
    'CurrentPreProfileMatrix'?: RationalTag | RationalArrayTag,
    'ColorimetricReference'?: NumberTag,
    'SRawType'?: AnyFieldTypeTag,
    'PanasonicTitle'?: AnyFieldTypeTag,
    'PanasonicTitle2'?: AnyFieldTypeTag,
    'CameraCalibrationSig'?: StringArrayTag | NumberTag | NumberArrayTag,
    'ProfileCalibrationSig'?: StringArrayTag | NumberTag | NumberArrayTag,
    'ProfileIFD'?: NumberTag | NumberArrayTag,
    'AsShotProfileName'?: StringArrayTag | NumberTag | NumberArrayTag,
    'ProfileName'?: StringArrayTag | NumberTag | NumberArrayTag,
    'ProfileHueSatMapDims'?: NumberArrayTag,
    'ProfileHueSatMapData1'?: NumberArrayTag,
    'ProfileHueSatMapData2'?: NumberArrayTag,
    'ProfileToneCurve'?: NumberArrayTag,
    'ProfileEmbedPolicy'?: NumberTag,
    'ProfileCopyright'?: StringArrayTag | NumberTag | NumberArrayTag,
    'ForwardMatrix1'?: RationalArrayTag,
    'ForwardMatrix2'?: RationalArrayTag,
    'PreviewApplicationName'?: StringArrayTag | NumberTag | NumberArrayTag,
    'PreviewApplicationVersion'?: StringArrayTag | NumberTag | NumberArrayTag,
    'PreviewSettingsName'?: StringArrayTag | NumberTag | NumberArrayTag,
    'PreviewSettingsDigest'?: NumberArrayTag,
    'PreviewColorSpace'?: NumberTag,
    'PreviewDateTime'?: StringArrayTag,
    'RawImageDigest'?: NumberArrayTag,
    'OriginalRawFileDigest'?: NumberArrayTag,
    'ProfileLookTableDims'?: NumberArrayTag,
    'ProfileLookTableData'?: NumberArrayTag,
    'TimeCodes'?: AnyFieldTypeTag,
    'FrameRate'?: AnyFieldTypeTag,
    'TStop'?: AnyFieldTypeTag,
    'ReelName'?: AnyFieldTypeTag,
    'OriginalDefaultFinalSize'?: NumberArrayTag,
    'OriginalBestQualitySize'?: NumberArrayTag,
    'OriginalDefaultCropSize'?: NumberArrayTag | RationalArrayTag,
    'CameraLabel'?: AnyFieldTypeTag,
    'ProfileHueSatMapEncoding'?: NumberTag,
    'ProfileLookTableEncoding'?: NumberTag,
    'BaselineExposureOffset'?: RationalTag,
    'DefaultBlackRender'?: NumberTag,
    'NewRawImageDigest'?: NumberArrayTag,
    'RawToPreviewGain'?: NumberTag,

    // JFIF tags
    'JFIF Version'?: NumberFileTag,
    'Resolution Unit'?: JfifResolutionUnitTag,
    'JFIF Thumbnail Width'?: NumberFileTag,
    'JFIF Thumbnail Height'?: NumberFileTag,
    'JFIF Thumbnail'?: JfifThumbnailTag,

    // Exif tags
    'ExposureTime'?: RationalTag,
    'FNumber'?: RationalTag,
    'ExposureProgram'?: NumberTag,
    'SpectralSensitivity'?: StringArrayTag,
    'ISOSpeedRatings'?: NumberTag | NumberArrayTag,
    'OECF'?: unknown,
    'TimeZoneOffset'?: AnyFieldTypeTag,
    'SelfTimerMode'?: AnyFieldTypeTag,
    'SensitivityType'?: NumberTag,
    'StandardOutputSensitivity'?: NumberTag,
    'RecommendedExposureIndex'?: NumberTag,
    'ISOSpeed'?: NumberTag,
    'ISOSpeedLatitudeyyy'?: NumberTag,
    'ISOSpeedLatitudezzz'?: NumberTag,
    'ExifVersion'?: NumberArrayTag | StringArrayTag, // Some writers store it as ASCII.
    'DateTimeOriginal'?: StringArrayTag,
    'DateTimeDigitized'?: StringArrayTag,
    'GooglePlusUploadCode'?: AnyFieldTypeTag,
    'ComponentsConfiguration'?: NumberArrayTag | NumberTag, // Some writers store one value.
    'CompressedBitsPerPixel'?: RationalTag,
    'ShutterSpeedValue'?: RationalTag,
    'ApertureValue'?: RationalTag,
    'BrightnessValue'?: RationalTag,
    'ExposureBiasValue'?: RationalTag,
    'MaxApertureValue'?: RationalTag,
    'SubjectDistance'?: RationalTag,
    'MeteringMode'?: NumberTag,
    'LightSource'?: NumberTag,
    'Flash'?: NumberTag,
    'FocalLength'?: RationalTag,
    'ImageNumber'?: AnyFieldTypeTag,
    'SecurityClassification'?: StringArrayTag,
    'ImageHistory'?: AnyFieldTypeTag,
    'SubjectArea'?: NumberArrayTag,
    'MakerNote'?: unknown,
    'UserComment'?: unknown,
    'SubSecTime'?: StringArrayTag,
    'SubSecTimeOriginal'?: StringArrayTag,
    'SubSecTimeDigitized'?: StringArrayTag,
    'ImageSourceData'?: AnyFieldTypeTag,
    'AmbientTemperature'?: RationalTag,
    'Humidity'?: RationalTag,
    'Pressure'?: RationalTag,
    'WaterDepth'?: RationalTag,
    'Acceleration'?: RationalTag,
    'CameraElevationAngle'?: RationalTag,
    'FlashpixVersion'?: NumberArrayTag | StringArrayTag | NumberTag, // Some writers store it as ASCII or as one value.
    'ColorSpace'?: NumberTag,
    'PixelXDimension'?: NumberTag,
    'PixelYDimension'?: NumberTag,
    'RelatedSoundFile'?: StringArrayTag,
    'Interoperability IFD Pointer'?: NumberTag,
    'FlashEnergy'?: RationalTag,
    'SpatialFrequencyResponse'?: unknown,
    'FocalPlaneXResolution'?: RationalTag,
    'FocalPlaneYResolution'?: RationalTag,
    'FocalPlaneResolutionUnit'?: NumberTag,
    'SubjectLocation'?: NumberArrayTag,
    'ExposureIndex'?: RationalTag,
    'SensingMethod'?: NumberTag,
    'FileSource'?: NumberTag,
    'SceneType'?: NumberTag | StringArrayTag, // Some writers store it as ASCII.
    'CFAPattern'?: unknown,
    'CustomRendered'?: NumberTag,
    'ExposureMode'?: NumberTag,
    'WhiteBalance'?: NumberTag,
    'DigitalZoomRatio'?: RationalTag,
    'FocalLengthIn35mmFilm'?: NumberTag,
    'SceneCaptureType'?: NumberTag,
    'GainControl'?: NumberTag,
    'Contrast'?: NumberTag,
    'Saturation'?: NumberTag,
    'Sharpness'?: NumberTag,
    'DeviceSettingDescription'?: unknown,
    'SubjectDistanceRange'?: NumberTag,
    'ImageUniqueID'?: StringArrayTag,
    'CameraOwnerName'?: StringArrayTag,
    'BodySerialNumber'?: StringArrayTag,
    'LensSpecification'?: RationalArrayTag,
    'LensMake'?: StringArrayTag,
    'LensModel'?: StringArrayTag,
    'LensSerialNumber'?: StringArrayTag,
    'CompositeImage'?: NumberTag,
    'SourceImageNumberOfCompositeImage'?: NumberArrayTag,
    'SourceExposureTimesOfCompositeImage'?: NumberTag | NumberArrayTag,
    'Gamma'?: RationalTag,
    'Padding'?: AnyFieldTypeTag,
    'OffsetSchema'?: AnyFieldTypeTag,
    'OwnerName'?: AnyFieldTypeTag,
    'SerialNumber'?: AnyFieldTypeTag,
    'Lens'?: AnyFieldTypeTag,
    'RawFile'?: AnyFieldTypeTag,
    'Converter'?: AnyFieldTypeTag,
    'Exposure'?: AnyFieldTypeTag,
    'Shadows'?: AnyFieldTypeTag,
    'Brightness'?: AnyFieldTypeTag,
    'Smoothness'?: AnyFieldTypeTag,
    'MoireFilter'?: AnyFieldTypeTag,
    'OffsetTime'?: StringArrayTag,
    'OffsetTimeDigitized'?: StringArrayTag,
    'OffsetTimeOriginal'?: StringArrayTag,
    'GPSHPositioningError'?: RationalTag,

    // GPS tags
    'GPSVersionID'?: NumberArrayTag,
    'GPSLatitudeRef'?: StringArrayTag,
    'GPSLatitude'?: GpsDecimalCoordinateTag,
    'GPSLongitudeRef'?: StringArrayTag,
    'GPSLongitude'?: GpsDecimalCoordinateTag,
    'GPSAltitudeRef'?: NumberTag,
    'GPSAltitude'?: RationalTag,
    'GPSTimeStamp'?: RationalArrayTag,
    'GPSSatellites'?: StringArrayTag,
    'GPSStatus'?: StringArrayTag,
    'GPSMeasureMode'?: StringArrayTag,
    'GPSDOP'?: RationalTag,
    'GPSSpeedRef'?: StringArrayTag,
    'GPSSpeed'?: RationalTag,
    'GPSTrackRef'?: StringArrayTag,
    'GPSTrack'?: RationalTag,
    'GPSImgDirectionRef'?: StringArrayTag,
    'GPSImgDirection'?: RationalTag,
    'GPSMapDatum'?: StringArrayTag,
    'GPSDestLatitudeRef'?: StringArrayTag,
    'GPSDestLatitude'?: GpsDecimalCoordinateTag,
    'GPSDestLongitudeRef'?: StringArrayTag,
    'GPSDestLongitude'?: GpsDecimalCoordinateTag,
    'GPSDestBearingRef'?: StringArrayTag,
    'GPSDestBearing'?: RationalTag,
    'GPSDestDistanceRef'?: StringArrayTag,
    'GPSDestDistance'?: RationalTag,
    'GPSProcessingMethod'?: unknown,
    'GPSAreaInformation'?: unknown,
    'GPSDateStamp'?: StringArrayTag,
    'GPSDifferential'?: NumberTag,

    // MPF tags
    'MPFVersion'?: NumberArrayTag | StringArrayTag, // Some writers store it as ASCII.
    'NumberOfImages'?: NumberTag,
    'MPEntry'?: NumberArrayTag,
    'ImageUIDList'?: NumberArrayTag,
    'TotalFrames'?: NumberTag,
    'Images'?: MPFImageTags[],

    // IPTC tags
    // IPTC tags don't have explicit types. Therefore the raw value will always
    // be an array of numbers. Maybe it could be changed in the code to add the
    // types afterwards. In that case the types are listed as comments below.
    'Model Version'?: NumberArrayTag, // NumberTag
    'Destination'?: NumberArrayTag | NumberArrayTag[], // StringTag
    'File Format'?: NumberArrayTag, // NumberTag
    'File Format Version'?: NumberArrayTag, // NumberTag
    'Service Identifier'?: NumberArrayTag, // StringTag
    'Envelope Number'?: NumberArrayTag, // StringTag
    'Product ID'?: NumberArrayTag, // StringTag
    'Envelope Priority'?: NumberArrayTag, // StringTag
    'Date Sent'?: NumberArrayTag, // StringTag
    'Time Sent'?: NumberArrayTag, // StringTag
    'Coded Character Set'?: NumberArrayTag, // StringTag
    'UNO'?: NumberArrayTag, // StringTag
    'ARM Identifier'?: NumberArrayTag, // NumberTag
    'ARM Version'?: NumberArrayTag, // NumberTag
    'Record Version'?: NumberArrayTag, // NumberTag
    'Object Type Reference'?: NumberArrayTag, // StringTag
    'Object Attribute Reference'?: NumberArrayTag, // StringTag
    'Object Name'?: NumberArrayTag, // StringTag
    'Edit Status'?: NumberArrayTag, // StringTag
    'Editorial Update'?: NumberArrayTag, // StringTag
    'Urgency'?: NumberArrayTag, // StringTag
    'Subject Reference'?: NumberArrayTag | NumberArrayTag[], // StringTag
    'Category'?: NumberArrayTag, // StringTag
    'Supplemental Category'?: NumberArrayTag | NumberArrayTag[], // StringTag
    'Fixture Identifier'?: NumberArrayTag, // StringTag
    'Keywords'?: NumberArrayTag | NumberArrayTag[], // StringTag
    'Content Location Code'?: NumberArrayTag | NumberArrayTag[], // StringTag
    'Content Location Name'?: NumberArrayTag | NumberArrayTag[], // StringTag
    'Release Date'?: NumberArrayTag, // StringTag
    'Release Time'?: NumberArrayTag, // StringTag
    'Expiration Date'?: NumberArrayTag, // StringTag
    'Expiration Time'?: NumberArrayTag, // StringTag
    'Special Instructions'?: NumberArrayTag, // StringTag
    'Action Advised'?: NumberArrayTag, // StringTag
    'Reference Service'?: NumberArrayTag | NumberArrayTag[], // StringTag
    'Reference Date'?: NumberArrayTag | NumberArrayTag[], // StringTag
    'Reference Number'?: NumberArrayTag | NumberArrayTag[], // StringTag
    'Date Created'?: NumberArrayTag, // StringTag
    'Time Created'?: NumberArrayTag, // StringTag
    'Digital Creation Date'?: NumberArrayTag, // StringTag
    'Digital Creation Time'?: NumberArrayTag, // StringTag
    'Originating Program'?: NumberArrayTag, // StringTag
    'Program Version'?: NumberArrayTag, // StringTag
    'Object Cycle'?: NumberArrayTag, // StringTag
    'By-line'?: NumberArrayTag | NumberArrayTag[], // StringTag
    'By-line Title'?: NumberArrayTag | NumberArrayTag[], // StringTag
    'City'?: NumberArrayTag, // StringTag
    'Sub-location'?: NumberArrayTag, // StringTag
    'Province/State'?: NumberArrayTag, // StringTag
    'Country/Primary Location Code'?: NumberArrayTag, // StringTag
    'Country/Primary Location Name'?: NumberArrayTag, // StringTag
    'Original Transmission Reference'?: NumberArrayTag, // StringTag
    'Headline'?: NumberArrayTag, // StringTag
    'Credit'?: NumberArrayTag, // StringTag
    'Source'?: NumberArrayTag, // StringTag
    'Copyright Notice'?: NumberArrayTag, // StringTag
    'Contact'?: NumberArrayTag | NumberArrayTag[], // StringTag
    'Caption/Abstract'?: NumberArrayTag, // StringTag
    'Writer/Editor'?: NumberArrayTag | NumberArrayTag[], // StringTag
    'Rasterized Caption'?: NumberArrayTag, // NumberArrayTag
    'Image Type'?: NumberArrayTag, // StringTag
    'Image Orientation'?: NumberArrayTag, // StringTag
    'Language Identifier'?: NumberArrayTag, // StringTag
    'Audio Type'?: NumberArrayTag, // StringTag
    'Audio Sampling Rate'?: NumberArrayTag, // StringTag
    'Audio Sampling Resolution'?: NumberArrayTag, // StringTag
    'Audio Duration'?: NumberArrayTag, // StringTag
    'Audio Outcue'?: NumberArrayTag, // StringTag
    'Short Document ID'?: NumberArrayTag, // NumberTag
    'Unique Document ID'?: NumberArrayTag, // NumberTag
    'Owner ID'?: NumberArrayTag, // NumberTag
    'ObjectData Preview File Format'?: NumberArrayTag, // NumberArrayTag
    'Record 2 destination'?: NumberArrayTag, // NumberArrayTag
    'ObjectData Preview File Format Version'?: NumberArrayTag, // NumberTag
    'ObjectData Preview Data'?: NumberArrayTag, // NumberTag
    'Size Mode'?: NumberArrayTag, // NumberTag
    'Max Subfile Size'?: NumberArrayTag, // NumberTag
    'ObjectData Size Announced'?: NumberArrayTag, // NumberTag
    'Maximum ObjectData Size'?: NumberArrayTag, // NumberTag

    'Thumbnail'?: ThumbnailTags
}

interface IccTags {
    [name: string]: ValueTag;
}

export type Tags = FileTags & XmpTags & IccTags & PngTags & RiffTags & GifTags & PhotoshopTags & CanonTags & PentaxTags & CompositeTags & {
    /** @deprecated Use `thumbnail`. `Thumbnail` is removed in v5. */
    'Thumbnail'?: ThumbnailTags;
    /** Can instead be a PNG text or XMP tag named `thumbnail` when the file has one. */
    'thumbnail'?: ThumbnailTags;
    'Images'?: MPFImageTags[],
} & {
    [K in keyof Omit<ExifTags, 'Thumbnail'>]: ExifTags[K] | XmpTag;
}
