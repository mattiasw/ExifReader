###
# ExifReader 0.1
# http://github.com/mattiasw/exifreader
# Copyright (C) 2011  Mattias Wallander <mattias@wallander.eu>
# Licensed under the GNU Lesser General Public License version 3 or later
# See license text at http://www.gnu.org/licenses/lgpl.txt
###

class (exports ? this).ExifReader
  _tiffHeaderOffset: 0x0c  # 2 bytes JPEG ID + 10 bytes APP1 header

  constructor: () ->
    @_getTagValueAt = {
      1: (offset) => @_getByteAt offset,
      2: (offset) => @_getAsciiAt offset,
      3: (offset) => @_getShortAt offset,
      4: (offset) => @_getLongAt offset,
      5: (offset) => @_getRationalAt offset,
      7: (offset) => @_getUndefinedAt offset,
      9: (offset) => @_getSlongAt offset,
      10: (offset) => @_getSrationalAt offset
    }

  ###
  # Loads all the Exif tags from the specified image file buffer.
  #
  # @_data ArrayBuffer Image file data
  ###
  load: (data) ->
    @loadView(new DataView data)

  ###
  # Loads all the Exif tags from the specified image file buffer view. Probably
  # used when DataView isn't supported by the browser.
  #
  # @_dataView DataView Image file data view
  ###
  loadView: (@_dataView) ->
    @_tags = {}
    @_checkImageHeader()
    @_readTags()

  _checkImageHeader: ->
    # JPEG identifier (0xff 0xd8), Marker Prefix (0xff), APP1 (0xe1),
    # Length of field (2 bytes), "Exif", Null (0x00), padding (0x00)
    if @_dataView.byteLength < 12 or @_dataView.getUint32(0, false) != 0xffd8ffe1 or @_dataView.getUint32(6, false) != 0x45786966 or @_dataView.getUint16(10, false) != 0x0000
      throw 'Invalid image format or no Exif data'

  _readTags: ->
    @_setByteOrder()
    @_read0thIfd()
    @_readExifIfd()
    @_readGpsIfd()
    @_readInteroperabilityIfd()

  _setByteOrder: () ->
    if @_dataView.getUint16(@_tiffHeaderOffset) == 0x4949
      @_littleEndian = true
    else if @_dataView.getUint16(@_tiffHeaderOffset) == 0x4d4d
      @_littleEndian = false
    else
      throw 'Illegal byte order value. Faulty image.'

  _read0thIfd: () ->
    ifdOffset = @_getIfdOffset()
    @_readIfd '0th', ifdOffset

  _getIfdOffset: () ->
    @_tiffHeaderOffset + @_getLongAt(@_tiffHeaderOffset + 4)

  _readExifIfd: () ->
    if @_tags['Exif IFD Pointer']?
      ifdOffset = @_tiffHeaderOffset + @_tags['Exif IFD Pointer']
      @_readIfd 'exif', ifdOffset

  _readGpsIfd: () ->
    if @_tags['GPS Info IFD Pointer']?
      ifdOffset = @_tiffHeaderOffset + @_tags['GPS Info IFD Pointer']
      @_readIfd 'gps', ifdOffset

  _readInteroperabilityIfd: () ->
    if @_tags['Interoperability IFD Pointer']?
      ifdOffset = @_tiffHeaderOffset + @_tags['Interoperability IFD Pointer']
      @_readIfd 'interoperability', ifdOffset

  _readIfd: (ifdType, offset) ->
    numberOfFields = @_getShortAt offset
    offset += 2
    for fieldIndex in [0...numberOfFields]
      tag = @_readTag(ifdType, offset)
      @_tags[tag.name] = tag.value
      offset += 12

  _readTag: (ifdType, offset) ->
    tagCode = @_getShortAt offset
    tagType = @_getShortAt(offset + 2)
    tagCount = @_getLongAt(offset + 4)
    if @_typeSizes[tagType] * tagCount <= 4
      # If the value itself fits in four bytes, it is recorded instead of just
      # the offset.
      tagValue = @_getTagValue(offset + 8, tagType, tagCount)
    else
      tagValueOffset = @_getLongAt(offset + 8)
      tagValue = @_getTagValue(@_tiffHeaderOffset + tagValueOffset, tagType, tagCount)
    if @_tagNames[ifdType][tagCode]?
      return {'name': @_tagNames[ifdType][tagCode], 'value': tagValue}
    else
      return {'name': "undefined-#{tagCode}", 'value': tagValue}

  _getTagValue: (offset, type, count) ->
    value = for valueIndex in [0...count]
      tagValue = @_getTagValueAt[type](offset)
      offset += @_typeSizes[type]
      tagValue
    if value.length == 1
      value = value[0]
    else if type == @_tagTypes['ASCII']
      value = @_getAsciiValue value
    value

  _getAsciiValue: (charArray) ->
    newCharArray = for char in charArray
      if char == 0x00
        break
      String.fromCharCode char
    newCharArray.join ''

  _getByteAt: (offset) ->
    @_dataView.getUint8 offset

  _getAsciiAt: (offset) ->
    @_dataView.getUint8 offset

  _getShortAt: (offset) ->
    @_dataView.getUint16 offset, @_littleEndian

  _getLongAt: (offset) ->
    @_dataView.getUint32 offset, @_littleEndian

  _getRationalAt: (offset) ->
    @_getLongAt(offset) / @_getLongAt(offset + 4)

  _getUndefinedAt: (offset) ->
    @_getByteAt offset

  _getSlongAt: (offset) ->
    @_dataView.getInt32 offset, @_littleEndian

  _getSrationalAt: (offset) ->
    @_getSlongAt(offset) / @_getSlongAt(offset + 4)

  _typeSizes: {
    1: 1,  # BYTE
    2: 1,  # ASCII
    3: 2,  # SHORT
    4: 4,  # LONG
    5: 8,  # RATIONAL
    7: 1,  # UNDEFINED
    9: 4,  # SLONG
    10: 8  # SRATIONAL
  }

  _tagTypes: {
    'BYTE': 1,
    'ASCII': 2,
    'SHORT': 3,
    'LONG': 4,
    'RATIONAL': 5,
    'UNDEFINED': 7,
    'SLONG': 9,
    'SRATIONAL': 10
  }

  _tagNames: {
    '0th': {
      0x0100: 'ImageWidth',
      #0x0100: {'name': 'ImageWidth', 'desc': (value) -> value},
      0x0101: 'ImageLength',
      0x0102: 'BitsPerSample',
      0x0103: 'Compression',
      0x0106: 'PhotometricInterpretation',
      0x010e: 'ImageDescription',
      0x010f: 'Make',
      0x0110: 'Model',
      0x0111: 'StripOffsets',
      0x0112: 'Orientation',
      0x0115: 'SamplesPerPixel',
      0x0116: 'RowsPerStrip',
      0x0117: 'StripByteCounts',
      0x011a: 'XResolution',
      0x011b: 'YResolution',
      0x011c: 'PlanarConfiguration',
      0x0128: 'ResolutionUnit',
      0x012d: 'TransferFunction',
      0x0131: 'Software',
      0x0132: 'DateTime',
      0x013b: 'Artist',
      0x013e: 'WhitePoint',
      0x013f: 'PrimaryChromaticities',
      0x0201: 'JPEGInterchangeFormat',
      0x0202: 'JPEGInterchangeFormatLength',
      0x0211: 'YCbCrCoefficients',
      0x0212: 'YCbCrSubSampling',
      0x0213: 'YCbCrPositioning',
      0x0214: 'ReferenceBlackWhite',
      0x8298: 'Copyright',
      0x8769: 'Exif IFD Pointer',
      0x8825: 'GPS Info IFD Pointer'
    },
    'exif': {
      0x829a: 'ExposureTime',
      0x829d: 'FNumber',
      0x8822: 'ExposureProgram',
      0x8824: 'SpectralSensitivity',
      0x8827: 'ISOSpeedRatings',
      0x8828: 'OECF',
      0x9000: 'ExifVersion',
      0x9003: 'DateTimeOriginal',
      0x9004: 'DateTimeDigitized',
      0x9101: 'ComponentsConfiguration',
      0x9102: 'CompressedBitsPerPixel',
      0x9201: 'ShutterSpeedValue',
      0x9202: 'ApertureValue',
      0x9203: 'BrightnessValue',
      0x9204: 'ExposureBiasValue',
      0x9205: 'MaxApertureValue',
      0x9206: 'SubjectDistance',
      0x9207: 'MeteringMode',
      0x9208: 'LightSource',
      0x9209: 'Flash',
      0x920a: 'FocalLength',
      0x9214: 'SubjectArea',
      0x927c: 'MakerNote',
      0x9286: 'UserComment',
      0x9290: 'SubSecTime',
      0x9291: 'SubSecTimeOriginal',
      0x9292: 'SubSecTimeDigitized',
      0xa000: 'FlashpixVersion',
      0xa001: 'ColorSpace',
      0xa002: 'PixelXDimension',
      0xa003: 'PixelYDimension',
      0xa004: 'RelatedSoundFile',
      0xa005: 'Interoperability IFD Pointer',
      0xa20b: 'FlashEnergy',
      0xa20c: 'SpatialFrequencyResponse',
      0xa20e: 'FocalPlaneXResolution',
      0xa20f: 'FocalPlaneYResolution',
      0xa210: 'FocalPlaneResolutionUnit',
      0xa214: 'SubjectLocation',
      0xa215: 'ExposureIndex',
      0xa217: 'SensingMethod',
      0xa300: 'FileSource',
      0xa301: 'SceneType',
      0xa302: 'CFAPattern',
      0xa401: 'CustomRendered',
      0xa402: 'ExposureMode',
      0xa403: 'WhiteBalance',
      0xa404: 'DigitalZoomRatio',
      0xa405: 'FocalLengthIn35mmFilm',
      0xa406: 'SceneCaptureType',
      0xa407: 'GainControl',
      0xa408: 'Contrast',
      0xa409: 'Saturation',
      0xa40a: 'Sharpness',
      0xa40b: 'DeviceSettingDescription',
      0xa40c: 'SubjectDistanceRange',
      0xa420: 'ImageUniqueID'
    },
    'gps': {
      0x0000: 'GPSVersionID',
      0x0001: 'GPSLatitudeRef',
      0x0002: 'GPSLatitude',
      0x0003: 'GPSLongitudeRef',
      0x0004: 'GPSLongitude',
      0x0005: 'GPSAltitudeRef',
      0x0006: 'GPSAltitude',
      0x0007: 'GPSTimeStamp',
      0x0008: 'GPSSatellites',
      0x0009: 'GPSStatus',
      0x000a: 'GPSMeasureMode',
      0x000b: 'GPSDOP',
      0x000c: 'GPSSpeedRef',
      0x000d: 'GPSSpeed',
      0x000e: 'GPSTrackRef',
      0x000f: 'GPSTrack',
      0x0010: 'GPSImgDirectionRef',
      0x0011: 'GPSImgDirection',
      0x0012: 'GPSMapDatum',
      0x0013: 'GPSDestLatitudeRef',
      0x0014: 'GPSDestLatitude',
      0x0015: 'GPSDestLongitudeRef',
      0x0016: 'GPSDestLongitude',
      0x0017: 'GPSDestBearingRef',
      0x0018: 'GPSDestBearing',
      0x0019: 'GPSDestDistanceRef',
      0x001a: 'GPSDestDistance',
      0x001b: 'GPSProcessingMethod',
      0x001c: 'GPSAreaInformation',
      0x001d: 'GPSDateStamp',
      0x001e: 'GPSDifferential'
    },
    'interoperability': {
      0x0001: 'InteroperabilityIndex'
      0x0002: 'UnknownInteroperabilityTag0x0002'
      0x1001: 'UnknownInteroperabilityTag0x1001'
      0x1002: 'UnknownInteroperabilityTag0x1002'
    }
  }

  ###
  # Gets the image's value of the tag with the given name.
  #
  # name string The name of the tag to get the value of
  #
  # Returns the description of the tag with the given name if it exists,
  # otherwise throws "Undefined".
  ###
  getTagDescription: (name) ->
    if @_tags[name]?
      return @_tags[name]
    else
      throw 'Undefined'

  ###
  # Gets all the image's tags.
  #
  # Returns the image's tags as an associative array: name -> description.
  ###
  getAllTags: () ->
    return @_tags
