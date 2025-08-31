/// <reference types="node" />
/// <reference lib="es2017.sharedmemory" />

export as namespace ExifReader;

interface FileTags {
    'FileType'?: 'TIFF' | 'JPEG' | 'PNG' | 'HEIC' | 'AVIF' | 'WebP' | 'GIF',
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

type TypedTag<V> = {
    id: number,
    description: string,
    value: V
}

type RationalTag = TypedTag<[number, number]>

type NumberTag = TypedTag<number>;

type NumberArrayTag = TypedTag<number[]>

type StringArrayTag = TypedTag<string[]>

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
    StripOffsets?: NumberArrayTag,
    SamplesPerPixel?: NumberTag,
    RowsPerStrip?: NumberTag,
    StripByteCounts?: NumberArrayTag
}

export interface ExpandedTags {
    file?: FileTags,
    jfif?: JfifTags,
    pngFile?: PngFileTags,
    pngText?: PngTextTags,
    png?: PngTags,
    exif?: ExifTags,
    iptc?: ExifTags,
    xmp?: { _raw: string } & XmpTags,
    icc?: IccTags,
    riff?: RiffTags,
    gif?: GifTags,
    Thumbnail?: ThumbnailTags,
    gps?: GpsTags
    photoshop?: PhotoshopTags;
    makerNotes?: CanonTags & PentaxTags;
    composite?: CompositeTags;
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

interface PhotoshopTags {
    // CaptionDigest: StringTag;
    // PrintInformation: StringTag;
    // PrintStyle: StringTag;
    PathInformation: StringTag;
    ClippingPathName: StringTag;
}

interface CanonTags {
    AutoRotate: {
        value: number;
        description: 'None' | 'Rotate 90 CW' | 'Rotate 180' | 'Rotate 270 CW' | 'Unknown';
    };
}

interface PentaxTags {
    PentaxVersion: {
        value: number[];
        description: string;
    };
    PentaxModelID: {
        value: number;
        description: string;
    };
    Orientation: {
        value: number;
        description: 'Horizontal (normal)' | 'Rotate 270 CW' | 'Rotate 180' | 'Rotate 90 CW' | 'Upwards' | 'Downwards' | 'Unknown';
    };
    RollAngle: {
        value: number;
        description: string;
    };
    PitchAngle: {
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

type CommonOptions = {
    includeUnknown?: boolean,
    domParser?: XmlDomParser
};

export function load(data: ArrayBuffer | SharedArrayBuffer | Buffer): Tags;
export function load(data: ArrayBuffer | SharedArrayBuffer | Buffer, options: CommonOptions & {expanded: true, length?: number, async?: false}): ExpandedTags;
export function load(data: ArrayBuffer | SharedArrayBuffer | Buffer, options: CommonOptions & {expanded?: false, length?: number, async?: false}): Tags;
export function load(data: ArrayBuffer | SharedArrayBuffer | Buffer, options: CommonOptions & {expanded: true, length?: number, async: true}): Promise<ExpandedTags>;
export function load(data: ArrayBuffer | SharedArrayBuffer | Buffer, options: CommonOptions & {expanded?: false, length?: number, async: true}): Promise<Tags>;
export function load(data: string | File): Promise<Tags>;
export function load(data: string | File, options: CommonOptions & {expanded: true, length?: number, async?: boolean }): Promise<ExpandedTags>;
export function load(data: string | File, options: CommonOptions & {expanded?: false, length?: number, async?: boolean }): Promise<Tags>;
export function loadView(data: DataView): Tags;
export function loadView(data: DataView, options: CommonOptions & {expanded: true, async?: false}): ExpandedTags;
export function loadView(data: DataView, options: CommonOptions & {expanded?: false, async?: false}): Tags;
export function loadView(data: DataView, options: CommonOptions & {expanded: true, async: true}): Promise<ExpandedTags>;
export function loadView(data: DataView, options: CommonOptions & {expanded?: false, async: true}): Promise<Tags>;

export namespace errors {
    export class MetadataMissingError extends Error {}
}

interface ExifTags {
    // Interoperability tags
    'InteroperabilityIndex'?: StringArrayTag,

    // 0th IFD tags
    'ImageWidth'?: NumberTag,
    'ImageLength'?: NumberTag,
    'BitsPerSample'?: NumberArrayTag,
    'Compression'?: NumberTag,
    'PhotometricInterpretation'?: NumberTag,
    'DocumentName'?: StringArrayTag,
    'ImageDescription'?: StringArrayTag,
    'Make'?: StringArrayTag,
    'Model'?: StringArrayTag,
    'StripOffsets'?: NumberArrayTag,
    'Orientation'?: NumberTag,
    'SamplesPerPixel'?: NumberTag,
    'RowsPerStrip'?: NumberTag,
    'StripByteCounts'?: NumberArrayTag,
    'XResolution'?: RationalTag | NumberFileTag, // Also in JFIF tags.
    'YResolution'?: RationalTag | NumberFileTag, // Also in JFIF tags.
    'PlanarConfiguration'?: NumberTag,
    'ResolutionUnit'?: NumberTag,
    'TransferFunction'?: NumberArrayTag,
    'Software'?: StringArrayTag,
    'DateTime'?: StringArrayTag,
    'Artist'?: StringArrayTag,
    'WhitePoint'?: NumberArrayTag,
    'PrimaryChromaticities'?: NumberArrayTag,
    'JPEGInterchangeFormat'?: NumberTag,
    'JPEGInterchangeFormatLength'?: NumberTag,
    'YCbCrCoefficients'?: NumberArrayTag,
    'YCbCrSubSampling'?: NumberArrayTag,
    'YCbCrPositioning'?: NumberTag,
    'ReferenceBlackWhite'?: NumberArrayTag,
    'Copyright'?: StringArrayTag,
    'Exif IFD Pointer'?: NumberTag,
    'GPS Info IFD Pointer'?: NumberTag,

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
    'ExifVersion'?: NumberArrayTag,
    'DateTimeOriginal'?: StringArrayTag,
    'DateTimeDigitized'?: StringArrayTag,
    'ComponentsConfiguration'?: NumberArrayTag,
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
    'SubjectArea'?: NumberArrayTag,
    'MakerNote'?: unknown,
    'UserComment'?: unknown,
    'SubSecTime'?: StringArrayTag,
    'SubSecTimeOriginal'?: StringArrayTag,
    'SubSecTimeDigitized'?: StringArrayTag,
    'FlashpixVersion'?: NumberArrayTag,
    'ColorSpace'?: NumberTag,
    'PixelXDimension'?: NumberTag,
    'PixelYDimension'?: NumberTag,
    'RelatedSoundFile'?: StringArrayTag,
    'Interoperability IFD Pointer'?: NumberTag,
    'FlashEnergy'?: NumberTag,
    'SpatialFrequencyResponse'?: unknown,
    'FocalPlaneXResolution'?: RationalTag,
    'FocalPlaneYResolution'?: RationalTag,
    'FocalPlaneResolutionUnit'?: NumberTag,
    'SubjectLocation'?: NumberArrayTag,
    'ExposureIndex'?: RationalTag,
    'SensingMethod'?: NumberTag,
    'FileSource'?: NumberTag,
    'SceneType'?: NumberTag,
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
    'LensMake'?: StringArrayTag,
    'LensModel'?: StringArrayTag,
    'OffsetTime'?: StringArrayTag,
    'OffsetTimeDigitized'?: StringArrayTag,
    'OffsetTimeOriginal'?: StringArrayTag,
    'GPSHPositioningError'?: NumberArrayTag,

    // GPS tags
    'GPSVersionID'?: NumberTag,
    'GPSLatitudeRef'?: StringArrayTag,
    'GPSLatitude'?: TypedTag<[[number, number], [number, number], [number, number]]>,
    'GPSLongitudeRef'?: StringArrayTag,
    'GPSLongitude'?: TypedTag<[[number, number], [number, number], [number, number]]>,
    'GPSAltitudeRef'?: NumberTag,
    'GPSAltitude'?: RationalTag,
    'GPSTimeStamp'?: NumberArrayTag,
    'GPSSatellites'?: StringArrayTag,
    'GPSStatus'?: StringArrayTag,
    'GPSMeasureMode'?: StringArrayTag,
    'GPSDOP'?: NumberTag,
    'GPSSpeedRef'?: StringArrayTag,
    'GPSSpeed'?: NumberTag,
    'GPSTrackRef'?: StringArrayTag,
    'GPSTrack'?: NumberTag,
    'GPSImgDirectionRef'?: StringArrayTag,
    'GPSImgDirection'?: RationalTag,
    'GPSMapDatum'?: StringArrayTag,
    'GPSDestLatitudeRef'?: StringArrayTag,
    'GPSDestLatitude'?: NumberArrayTag,
    'GPSDestLongitudeRef'?: StringArrayTag,
    'GPSDestLongitude'?: NumberArrayTag,
    'GPSDestBearingRef'?: StringArrayTag,
    'GPSDestBearing'?: NumberTag,
    'GPSDestDistanceRef'?: StringArrayTag,
    'GPSDestDistance'?: NumberTag,
    'GPSProcessingMethod'?: unknown,
    'GPSAreaInformation'?: unknown,
    'GPSDateStamp'?: StringArrayTag,
    'GPSDifferential'?: NumberTag,

    // MPF tags
    'MPFVersion'?: NumberArrayTag,
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

export type Tags = XmpTags & IccTags & PngTags & RiffTags & GifTags & PhotoshopTags & CanonTags & PentaxTags & CompositeTags & {
    'Thumbnail'?: ThumbnailTags;
    'Images'?: MPFImageTags[],
} & {
    [K in keyof ExifTags]: ExifTags[K] | XmpTag;
}
