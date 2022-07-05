/// <reference types="node" />
/// <reference lib="es2017.sharedmemory" />

export as namespace ExifReader;

interface FileTags {
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

interface NumberFileTag {
    description: string,
    value: number
}

interface NumberArrayFileTag {
    description: string,
    value: Array<number>
}

interface NumberTag {
    id: number,
    description: string,
    value: number
}

interface RationalTag {
    id: number,
    description: string,
    value: [number, number]
}

interface NumberArrayTag {
    id: number,
    description: string,
    value: Array<number>
}

interface ValueTag {
    description: string,
    value: String
}

interface StringArrayTag {
    id: number,
    description: string,
    value: Array<string>
}

interface XmpTag {
    value: string & Array<XmpTag> & XmpTags,
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

interface ExpandedTags {
    file?: FileTags,
    jfif?: JfifTags,
    pngFile?: PngFileTags,
    exif?: Tags,
    iptc?: Tags,
    xmp?: { _raw: string } & XmpTags,
    icc?: IccTags,
    Thumbnail?: ThumbnailTags,
    gps?: GpsTags
}

interface GpsTags {
    Latitude?: number,
    Longitude?: number,
    Altitude?: number
}

interface MPFImageTags {
    ImageFlags: {
        value: Array<number>,
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

export function load(data: ArrayBuffer | SharedArrayBuffer | Buffer): Tags & XmpTags & IccTags;
export function load(data: ArrayBuffer | SharedArrayBuffer | Buffer, options: {expanded: true}): ExpandedTags;
export function load(data: ArrayBuffer | SharedArrayBuffer | Buffer, options: {expanded?: false}): Tags & XmpTags & IccTags;
export function load(data: string | File): Promise<Tags & XmpTags & IccTags>;
export function load(data: string | File, options: {expanded: true}): Promise<ExpandedTags>;
export function load(data: string | File, options: {expanded?: false}): Promise<Tags & XmpTags & IccTags>;
export function loadView(data: DataView): Tags & XmpTags & IccTags;
export function loadView(data: DataView, options: {expanded: true}): ExpandedTags;
export function loadView(data: DataView, options: {expanded?: false}): Tags & XmpTags & IccTags;

export namespace errors {
    export class MetadataMissingError extends Error {}
}

interface Tags {
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
    'XResolution'?: NumberTag | NumberFileTag, // Also in JFIF tags.
    'YResolution'?: NumberTag | NumberFileTag, // Also in JFIF tags.
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
    'ExposureTime'?: NumberTag,
    'FNumber'?: NumberTag,
    'ExposureProgram'?: NumberTag,
    'SpectralSensitivity'?: StringArrayTag,
    'ISOSpeedRatings'?: NumberTag & NumberArrayTag,
    'OECF'?: NumberTag & NumberArrayTag,
    'ExifVersion'?: NumberArrayTag,
    'DateTimeOriginal'?: StringArrayTag,
    'DateTimeDigitized'?: StringArrayTag,
    'ComponentsConfiguration'?: NumberArrayTag,
    'CompressedBitsPerPixel'?: NumberTag,
    'ShutterSpeedValue'?: NumberTag,
    'ApertureValue'?: NumberTag,
    'BrightnessValue'?: NumberTag,
    'ExposureBiasValue'?: NumberTag,
    'MaxApertureValue'?: NumberTag,
    'SubjectDistance'?: NumberTag,
    'MeteringMode'?: NumberTag,
    'LightSource'?: NumberTag,
    'Flash'?: NumberTag,
    'FocalLength'?: NumberTag,
    'SubjectArea'?: NumberArrayTag,
    'MakerNote'?: NumberTag & NumberArrayTag,
    'UserComment'?: NumberTag & NumberArrayTag,
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
    'SpatialFrequencyResponse'?: NumberTag & NumberArrayTag,
    'FocalPlaneXResolution'?: NumberTag,
    'FocalPlaneYResolution'?: NumberTag,
    'FocalPlaneResolutionUnit'?: NumberTag,
    'SubjectLocation'?: NumberArrayTag,
    'ExposureIndex'?: NumberTag,
    'SensingMethod'?: NumberTag,
    'FileSource'?: NumberTag,
    'SceneType'?: NumberTag,
    'CFAPattern'?: NumberTag & NumberArrayTag,
    'CustomRendered'?: NumberTag,
    'ExposureMode'?: NumberTag,
    'WhiteBalance'?: NumberTag,
    'DigitalZoomRatio'?: NumberTag,
    'FocalLengthIn35mmFilm'?: NumberTag,
    'SceneCaptureType'?: NumberTag,
    'GainControl'?: NumberTag,
    'Contrast'?: NumberTag,
    'Saturation'?: NumberTag,
    'Sharpness'?: NumberTag,
    'DeviceSettingDescription'?: NumberTag & NumberArrayTag,
    'SubjectDistanceRange'?: NumberTag,
    'ImageUniqueID'?: StringArrayTag,
    'LensMake'?: StringArrayTag,
    'LensModel'?: StringArrayTag,

    // GPS tags
    'GPSVersionID'?: NumberTag,
    'GPSLatitudeRef'?: StringArrayTag,
    'GPSLatitude'?: NumberArrayTag,
    'GPSLongitudeRef'?: StringArrayTag,
    'GPSLongitude'?: NumberArrayTag,
    'GPSAltitudeRef'?: NumberTag,
    'GPSAltitude'?: NumberTag,
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
    'GPSImgDirection'?: NumberTag,
    'GPSMapDatum'?: StringArrayTag,
    'GPSDestLatitudeRef'?: StringArrayTag,
    'GPSDestLatitude'?: NumberArrayTag,
    'GPSDestLongitudeRef'?: StringArrayTag,
    'GPSDestLongitude'?: NumberArrayTag,
    'GPSDestBearingRef'?: StringArrayTag,
    'GPSDestBearing'?: NumberTag,
    'GPSDestDistanceRef'?: StringArrayTag,
    'GPSDestDistance'?: NumberTag,
    'GPSProcessingMethod'?: NumberTag & NumberArrayTag,
    'GPSAreaInformation'?: NumberTag & NumberArrayTag,
    'GPSDateStamp'?: StringArrayTag,
    'GPSDifferential'?: NumberTag,

    // MPF tags
    'MPFVersion'?: NumberArrayTag,
    'NumberOfImages'?: NumberTag,
    'MPEntry'?: NumberArrayTag,
    'ImageUIDList'?: NumberArrayTag,
    'TotalFrames'?: NumberTag,
    'Images'?: Array<MPFImageTags>,

    // IPTC tags
    // IPTC tags don't have explicit types. Therefore the raw value will always
    // be an array of numbers. Maybe it could be changed in the code to add the
    // types afterwards. In that case the types are listed as comments below.
    'Model Version'?: NumberArrayTag, // NumberTag
    'Destination'?: NumberArrayTag, // StringTag
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
    'Subject Reference'?: NumberArrayTag, // StringTag
    'Category'?: NumberArrayTag, // StringTag
    'Supplemental Category'?: NumberArrayTag, // StringTag
    'Fixture Identifier'?: NumberArrayTag, // StringTag
    'Keywords'?: NumberArrayTag[], // StringTag
    'Content Location Code'?: NumberArrayTag, // StringTag
    'Content Location Name'?: NumberArrayTag, // StringTag
    'Release Date'?: NumberArrayTag, // StringTag
    'Release Time'?: NumberArrayTag, // StringTag
    'Expiration Date'?: NumberArrayTag, // StringTag
    'Expiration Time'?: NumberArrayTag, // StringTag
    'Special Instructions'?: NumberArrayTag, // StringTag
    'Action Advised'?: NumberArrayTag, // StringTag
    'Reference Service'?: NumberArrayTag, // StringTag
    'Reference Date'?: NumberArrayTag, // StringTag
    'Reference Number'?: NumberArrayTag, // StringTag
    'Date Created'?: NumberArrayTag, // StringTag
    'Time Created'?: NumberArrayTag, // StringTag
    'Digital Creation Date'?: NumberArrayTag, // StringTag
    'Digital Creation Time'?: NumberArrayTag, // StringTag
    'Originating Program'?: NumberArrayTag, // StringTag
    'Program Version'?: NumberArrayTag, // StringTag
    'Object Cycle'?: NumberArrayTag, // StringTag
    'By-line'?: NumberArrayTag, // StringTag
    'By-line Title'?: NumberArrayTag, // StringTag
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
    'Contact'?: NumberArrayTag, // StringTag
    'Caption/Abstract'?: NumberArrayTag, // StringTag
    'Writer/Editor'?: NumberArrayTag, // StringTag
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
