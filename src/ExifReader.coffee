###
# ExifReader 1.0.1
# http://github.com/mattiasw/exifreader
# Copyright (C) 2011-2013  Mattias Wallander <mattias@wallander.eu>
# Licensed under the GNU Lesser General Public License version 3 or later
# See license text at http://www.gnu.org/licenses/lgpl.txt
###

class (exports ? this).ExifReader

  _MIN_DATA_BUFFER_LENGTH:   2
  _JPEG_ID_SIZE:             2
  _JPEG_ID:                  0xffd8
  _APP_MARKER_SIZE:          2
  _APP0_MARKER:              0xffe0
  _APP1_MARKER:              0xffe1
  _APP13_MARKER:             0xffed
  _APP15_MARKER:             0xffef
  _APP_ID_OFFSET:            4
  _BYTES_Exif:               0x45786966
  _BYTES_8BIM:               0x3842494d
  _TIFF_HEADER_OFFSET:       10  # From start of APP1 marker.
  _IPTC_DATA_OFFSET:         18  # From start of APP13 marker.
  _BYTE_ORDER_BIG_ENDIAN:    0x4949
  _BYTE_ORDER_LITTLE_ENDIAN: 0x4d4d

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
    @_tiffHeaderOffset = 0
    @_iptcDataOffset = 0

  ###
  # Loads all the Exif tags from the specified image file buffer.
  #
  # data ArrayBuffer Image file data
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
    foundMetaData = false
    @_tags = {}
    @_checkImageHeader()
    if @_hasExifData()
      foundMetaData = true
      @_readTags()
    if @_hasIptcData()
      foundMetaData = true
      @_readIptcTags()
    if not foundMetaData
      throw new Error 'No Exif data'

  _checkImageHeader: ->
    dataView = @_dataView
    if dataView.byteLength < @_MIN_DATA_BUFFER_LENGTH or dataView.getUint16(0, false) isnt @_JPEG_ID
      throw new Error 'Invalid image format'
    @_parseAppMarkers(dataView)

  _parseAppMarkers: (dataView) ->
    appMarkerPosition = @_JPEG_ID_SIZE
    loop
      if appMarkerPosition + @_APP_ID_OFFSET + 5 > dataView.byteLength
        break
      if @_isApp1ExifMarker(dataView, appMarkerPosition)
        fieldLength = dataView.getUint16(appMarkerPosition + @_APP_MARKER_SIZE, false)
        @_tiffHeaderOffset = appMarkerPosition + @_TIFF_HEADER_OFFSET
      else if @_isApp13PhotoshopMarker(dataView, appMarkerPosition)
        fieldLength = dataView.getUint16(appMarkerPosition + @_APP_MARKER_SIZE, false)
        @_iptcDataOffset = appMarkerPosition + @_IPTC_DATA_OFFSET
      else if @_isAppMarker(dataView, appMarkerPosition)
        fieldLength = dataView.getUint16(appMarkerPosition + @_APP_MARKER_SIZE, false)
      else
        break
      appMarkerPosition += @_APP_MARKER_SIZE + fieldLength

  _isApp1ExifMarker: (dataView, appMarkerPosition) ->
    dataView.getUint16(appMarkerPosition, false) is @_APP1_MARKER and dataView.getUint32(appMarkerPosition + @_APP_ID_OFFSET, false) is @_BYTES_Exif and dataView.getUint8(appMarkerPosition + @_APP_ID_OFFSET + 4, false) is 0x00

  _isApp13PhotoshopMarker: (dataView, appMarkerPosition) ->
    dataView.getUint16(appMarkerPosition, false) is @_APP13_MARKER and @_getString(dataView, appMarkerPosition + @_APP_ID_OFFSET, 13) is 'Photoshop 3.0' and dataView.getUint8(appMarkerPosition + @_APP_ID_OFFSET + 13, false) is 0x00

  _getString: (dataView, offset, length) ->
    chars = for i in [0...length]
      dataView.getUint8(offset + i, false)
    @_getAsciiValue(chars).join('')

  _isAppMarker: (dataView, appMarkerPosition) ->
    appMarker = dataView.getUint16(appMarkerPosition, false)
    appMarker >= @_APP0_MARKER and appMarker <= @_APP15_MARKER

  _hasExifData: ->
    @_tiffHeaderOffset isnt 0

  _hasIptcData: ->
    @_iptcDataOffset isnt 0

  _readTags: ->
    @_setByteOrder()
    @_read0thIfd()
    @_readExifIfd()
    @_readGpsIfd()
    @_readInteroperabilityIfd()

  _setByteOrder: () ->
    if @_dataView.getUint16(@_tiffHeaderOffset) == @_BYTE_ORDER_BIG_ENDIAN
      @_littleEndian = true
    else if @_dataView.getUint16(@_tiffHeaderOffset) == @_BYTE_ORDER_LITTLE_ENDIAN
      @_littleEndian = false
    else
      throw new Error 'Illegal byte order value. Faulty image.'

  _read0thIfd: () ->
    ifdOffset = @_getIfdOffset()
    @_readIfd '0th', ifdOffset

  _getIfdOffset: () ->
    @_tiffHeaderOffset + @_getLongAt(@_tiffHeaderOffset + 4)

  _readExifIfd: () ->
    if @_tags['Exif IFD Pointer']?
      ifdOffset = @_tiffHeaderOffset + @_tags['Exif IFD Pointer'].value
      @_readIfd 'exif', ifdOffset

  _readGpsIfd: () ->
    if @_tags['GPS Info IFD Pointer']?
      ifdOffset = @_tiffHeaderOffset + @_tags['GPS Info IFD Pointer'].value
      @_readIfd 'gps', ifdOffset

  _readInteroperabilityIfd: () ->
    if @_tags['Interoperability IFD Pointer']?
      ifdOffset = @_tiffHeaderOffset + @_tags['Interoperability IFD Pointer'].value
      @_readIfd 'interoperability', ifdOffset

  _readIfd: (ifdType, offset) ->
    numberOfFields = @_getShortAt offset
    offset += 2
    for fieldIndex in [0...numberOfFields]
      tag = @_readTag(ifdType, offset)
      @_tags[tag.name] = {'value': tag.value, 'description': tag.description}
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
    if tagType == @_tagTypes['ASCII']
      tagValue = @_splitNullSeparatedAsciiString tagValue
    if @_tagNames[ifdType][tagCode]?
      if @_tagNames[ifdType][tagCode]['name']? and @_tagNames[ifdType][tagCode]['description']?
        tagName = @_tagNames[ifdType][tagCode]['name']
        tagDescription = @_tagNames[ifdType][tagCode]['description'](tagValue)
      else
        tagName = @_tagNames[ifdType][tagCode]
        if tagValue instanceof Array
          tagDescription = tagValue.join ', '
        else
          tagDescription = tagValue
      return {'name': tagName, 'value': tagValue, 'description': tagDescription}
    else
      return {'name': "undefined-#{tagCode}", 'value': tagValue, 'description': tagValue}

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
    newCharArray = for charCode in charArray
      String.fromCharCode charCode

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

  _splitNullSeparatedAsciiString: (string) ->
    tagValue = []
    i = 0
    for character in string
      if character == '\x00'
        i++;
        continue
      if !tagValue[i]?
        tagValue[i] = ''
      tagValue[i] += character
    tagValue

  _readIptcTags: () ->
    try
      naaBlock = @_getIptcNaaResourceBlock()
    catch error
      return
    @_parseIptcTags(naaBlock)

  _getIptcNaaResourceBlock: () ->
    dataView = @_dataView
    loop
      if @_iptcDataOffset + 12 > dataView.byteLength
        break
      block = @_getIptcResourceBlock()
      if block['type'] is 0x0404
        return block
      else
        padding = 0
        if block['size'] % 2 isnt 0
          padding = 1
        @_iptcDataOffset += 12 + block['size'] + padding
    throw new Error 'No IPTC NAA resource block.'

  _getIptcResourceBlock: () ->
    dataView = @_dataView
    if dataView.getUint32(@_iptcDataOffset, false) isnt @_BYTES_8BIM
      throw new Error 'Not an IPTC resource block.'
    {
      'type': dataView.getUint16(@_iptcDataOffset + 4, false),
      'size': dataView.getUint16(@_iptcDataOffset + 10, false)
    }

  _parseIptcTags: (naaBlock) ->
    @_iptcDataOffset += 12
    endOfBlockOffset = @_iptcDataOffset + naaBlock['size']
    loop
      if @_iptcDataOffset >= endOfBlockOffset or @_iptcDataOffset >= @_dataView.byteLength
        break
      tag = @_readIptcTag()
      if not @_tags[tag.name]? or not tag['repeatable']?
        @_tags[tag.name] = {'value': tag.value, 'description': tag.description}
      else
        if not (@_tags[tag.name] instanceof Array)
          @_tags[tag.name] = [{'value': @_tags[tag.name].value, 'description': @_tags[tag.name].description}]
        @_tags[tag.name].push({'value': tag.value, 'description': tag.description})

  _readIptcTag: () ->
    dataView = @_dataView
    if dataView.getUint8(@_iptcDataOffset, false) isnt 0x1c
      throw new Error 'Not an IPTC NAA resource tag.'
    tagCode = dataView.getUint16(@_iptcDataOffset + 1, false)
    tagSize = dataView.getUint16(@_iptcDataOffset + 3, false)
    tagValue = @_getIptcTagValue(@_iptcDataOffset + 5, tagSize)
    if @_tagNames['iptc'][tagCode]?
      if @_tagNames['iptc'][tagCode]['name']? and @_tagNames['iptc'][tagCode]['description']?
        tagName = @_tagNames['iptc'][tagCode]['name']
        tagDescription = @_tagNames['iptc'][tagCode]['description'](tagValue, this)
      else
        tagName = @_tagNames['iptc'][tagCode]['name'] ? @_tagNames['iptc'][tagCode]
        if tagValue instanceof Array
          tagDescription = tagValue.map((charCode) -> String.fromCharCode(charCode)).join ''
        else
          tagDescription = tagValue
      tag = {'name': tagName, 'value': tagValue, 'description': tagDescription}
      if @_tagNames['iptc'][tagCode]['repeatable']?
        tag['repeatable'] = true
    else
      tag = {'name': "undefined-#{tagCode}", 'value': tagValue, 'description': tagValue}
    @_iptcDataOffset += 5 + tagSize
    tag

  _getIptcTagValue: (offset, size) ->
    dataView = @_dataView
    value = for valueIndex in [0...size]
      @_dataView.getUint8(offset + valueIndex)
    value

  _getStringValue: (value) ->
    value.map((charValue) -> String.fromCharCode(charValue)).join ''

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
      0x0101: 'ImageLength',
      0x0102: 'BitsPerSample',
      0x0103: 'Compression',
      0x0106: 'PhotometricInterpretation',
      0x010e: 'ImageDescription',
      0x010f: 'Make',
      0x0110: 'Model',
      0x0111: 'StripOffsets',
      0x0112: {'name': 'Orientation', 'description': (value) ->
        switch value
          when 1 then 'top-left'
          when 2 then 'top-right'
          when 3 then 'bottom-right'
          when 4 then 'bottom-left'
          when 5 then 'left-top'
          when 6 then 'right-top'
          when 7 then 'right-bottom'
          when 8 then 'left-bottom'
          else 'Undefined'
      }
      0x0115: 'SamplesPerPixel',
      0x0116: 'RowsPerStrip',
      0x0117: 'StripByteCounts',
      0x011a: 'XResolution',
      0x011b: 'YResolution',
      0x011c: 'PlanarConfiguration',
      0x0128: {'name': 'ResolutionUnit', 'description': (value) ->
        switch value
          when 2 then 'inches'
          when 3 then 'centimeters'
          else 'Unknown'
      }
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
      0x0213: {'name': 'YCbCrPositioning', 'description': (value) ->
        switch value
          when 1 then 'centered'
          when 2 then 'co-sited'
          else 'undefied ' + value
      }
      0x0214: 'ReferenceBlackWhite',
      0x8298: {'name': 'Copyright', 'description': (value) ->
        value.join '; '
      }
      0x8769: 'Exif IFD Pointer',
      0x8825: 'GPS Info IFD Pointer'
    },
    'exif': {
      0x829a: 'ExposureTime',
      0x829d: 'FNumber',
      0x8822: {'name': 'ExposureProgram', 'description': (value) ->
        switch value
          when 0 then 'Undefined'
          when 1 then 'Manual'
          when 2 then 'Normal program'
          when 3 then 'Aperture priority'
          when 4 then 'Shutter priority'
          when 5 then 'Creative program'
          when 6 then 'Action program'
          when 7 then 'Portrait mode'
          when 8 then 'Landscape mode'
          else 'Unknown'
      }
      0x8824: 'SpectralSensitivity',
      0x8827: 'ISOSpeedRatings',
      0x8828: {'name': 'OECF', 'description': (value) ->
        '[Raw OECF table data]'
      }
      0x9000: {'name': 'ExifVersion', 'description': (value) =>
        this::_getStringValue value
      }
      0x9003: 'DateTimeOriginal',
      0x9004: 'DateTimeDigitized',
      0x9101: {'name': 'ComponentsConfiguration', 'description': (value) ->
        string = ''
        for character in value
          switch character
            when 0x31 then string += 'Y'
            when 0x32 then string += 'Cb'
            when 0x33 then string += 'Cr'
            when 0x34 then string += 'R'
            when 0x35 then string += 'G'
            when 0x36 then string += 'B'
        string
      }
      0x9102: 'CompressedBitsPerPixel',
      0x9201: 'ShutterSpeedValue',
      0x9202: 'ApertureValue',
      0x9203: 'BrightnessValue',
      0x9204: 'ExposureBiasValue',
      0x9205: 'MaxApertureValue',
      0x9206: 'SubjectDistance',
      0x9207: {'name': 'MeteringMode', 'description': (value) ->
        switch value
          when 1 then 'Average'
          when 2 then 'CenterWeightedAverage'
          when 3 then 'Spot'
          when 4 then 'MultiSpot'
          when 5 then 'Pattern'
          when 6 then 'Partial'
          when 255 then 'Other'
          else 'Unknown'
      }
      0x9208: {'name': 'LightSource', 'description': (value) ->
        switch value
          when 1 then 'Daylight'
          when 2 then 'Fluorescent'
          when 3 then 'Tungsten (incandescent light)'
          when 4 then 'Flash'
          when 9 then 'Fine weather'
          when 10 then 'Cloudy weather'
          when 11 then 'Shade'
          when 12 then 'Daylight fluorescent (D 5700 – 7100K)'
          when 13 then 'Day white fluorescent (N 4600 – 5400K)'
          when 14 then 'Cool white fluorescent (W 3900 – 4500K)'
          when 15 then 'White fluorescent (WW 3200 – 3700K)'
          when 17 then 'Standard light A'
          when 18 then 'Standard light B'
          when 19 then 'Standard light C'
          when 20 then 'D55'
          when 21 then 'D65'
          when 22 then 'D75'
          when 23 then 'D50'
          when 24 then 'ISO studio tungsten'
          when 255 then 'Other light source'
          else 'Unknown'
      }
      0x9209: {'name': 'Flash', 'description': (value) ->
        switch value
          when 0x00 then 'Flash did not fire'
          when 0x01 then 'Flash fired'
          when 0x05 then 'Strobe return light not detected'
          when 0x07 then 'Strobe return light detected'
          when 0x09 then 'Flash fired, compulsory flash mode'
          when 0x0d then 'Flash fired, compulsory flash mode, return light not detected'
          when 0x0f then 'Flash fired, compulsory flash mode, return light detected'
          when 0x10 then 'Flash did not fire, compulsory flash mode'
          when 0x18 then 'Flash did not fire, auto mode'
          when 0x19 then 'Flash fired, auto mode'
          when 0x1d then 'Flash fired, auto mode, return light not detected'
          when 0x1f then 'Flash fired, auto mode, return light detected'
          when 0x20 then 'No flash function'
          when 0x41 then 'Flash fired, red-eye reduction mode'
          when 0x45 then 'Flash fired, red-eye reduction mode, return light not detected'
          when 0x47 then 'Flash fired, red-eye reduction mode, return light detected'
          when 0x49 then 'Flash fired, compulsory flash mode, red-eye reduction mode'
          when 0x4d then 'Flash fired, compulsory flash mode, red-eye reduction mode, return light not detected'
          when 0x4f then 'Flash fired, compulsory flash mode, red-eye reduction mode, return light detected'
          when 0x59 then 'Flash fired, auto mode, red-eye reduction mode'
          when 0x5d then 'Flash fired, auto mode, return light not detected, red-eye reduction mode'
          when 0x5f then 'Flash fired, auto mode, return light detected, red-eye reduction mode'
          else 'Unknown'
      }
      0x920a: 'FocalLength',
      0x9214: {'name': 'SubjectArea', 'description': (value) ->
        switch value.length
          when 2 then "Location; X: #{ value[0] }, Y: #{ value[1] }"
          when 3 then "Circle; X: #{ value[0] }, Y: #{ value[1] }, diameter: #{ value[2] }"
          when 4 then "Rectangle; X: #{ value[0] }, Y: #{ value[1] }, width: #{ value[2] }, height: #{ value[3] }"
          else 'Unknown'
      }
      0x927c: {'name': 'MakerNote', 'description': (value) ->
        '[Raw maker note data]'
      }
      0x9286: {'name': 'UserComment', 'description': (value) ->
        switch value[0...8].map((charCode) -> String.fromCharCode(charCode)).join ''
          when 'ASCII\x00\x00\x00' then value[8...value.length].map((charCode) -> String.fromCharCode(charCode)).join ''
          when 'JIS\x00\x00\x00\x00\x00' then '[JIS encoded text]'
          when 'UNICODE\x00' then '[Unicode encoded text]'
          when '\x00\x00\x00\x00\x00\x00\x00\x00' then '[Undefined encoding]'
      }
      0x9290: 'SubSecTime',
      0x9291: 'SubSecTimeOriginal',
      0x9292: 'SubSecTimeDigitized',
      0xa000: {'name': 'FlashpixVersion', 'description': (value) ->
        string = ''
        for charCode in value
          string += String.fromCharCode charCode
        string
      }
      0xa001: {'name': 'ColorSpace', 'description': (value) ->
        switch value
          when 1 then 'sRGB'
          when 0xffff then 'Uncalibrated'
          else 'Unknown'
      }
      0xa002: 'PixelXDimension',
      0xa003: 'PixelYDimension',
      0xa004: 'RelatedSoundFile',
      0xa005: 'Interoperability IFD Pointer',
      0xa20b: 'FlashEnergy',
      0xa20c: {'name': 'SpatialFrequencyResponse', 'description': (value) ->
        '[Raw SFR table data]'
      }
      0xa20e: 'FocalPlaneXResolution',
      0xa20f: 'FocalPlaneYResolution',
      0xa210: {'name': 'FocalPlaneResolutionUnit', 'description': (value) ->
        switch value
          when 2 then 'inches'
          when 3 then 'centimeters'
          else 'Unknown'
      }
      0xa214: {'name': 'SubjectLocation', 'description': (value) ->
        "X: #{ value[0] }, Y: #{ value[1] }"
      }
      0xa215: 'ExposureIndex',
      0xa217: {'name': 'SensingMethod', 'description': (value) ->
        switch value
          when 1 then 'Undefined'
          when 2 then 'One-chip color area sensor'
          when 3 then 'Two-chip color area sensor'
          when 4 then 'Three-chip color area sensor'
          when 5 then 'Color sequential area sensor'
          when 7 then 'Trilinear sensor'
          when 8 then 'Color sequential linear sensor'
          else 'Unknown'
      }
      0xa300: {'name': 'FileSource', 'description': (value) ->
        switch value
          when 3 then 'DSC'
          else 'Unknown'
      }
      0xa301: {'name': 'SceneType', 'description': (value) ->
        switch value
          when 1 then 'A directly photographed image'
          else 'Unknown'
      }
      0xa302: {'name': 'CFAPattern', 'description': (value) ->
        '[Raw CFA pattern table data]'
      }
      0xa401: {'name': 'CustomRendered', 'description': (value) ->
        switch value
          when 0 then 'Normal process'
          when 1 then 'Custom process'
          else 'Unknown'
      }
      0xa402: {'name': 'ExposureMode', 'description': (value) ->
        switch value
          when 0 then 'Auto exposure'
          when 1 then 'Manual exposure'
          when 2 then 'Auto bracket'
          else 'Unknown'
      }
      0xa403: {'name': 'WhiteBalance', 'description': (value) ->
        switch value
          when 0 then 'Auto white balance'
          when 1 then 'Manual white balance'
          else 'Unknown'
      }
      0xa404: {'name': 'DigitalZoomRatio', 'description': (value) ->
        switch value
          when 0 then 'Digital zoom was not used'
          else value
      }
      0xa405: {'name': 'FocalLengthIn35mmFilm', 'description': (value) ->
        switch value
          when 0 then 'Unknown'
          else value
      }
      0xa406: {'name': 'SceneCaptureType', 'description': (value) ->
        switch value
          when 0 then 'Standard'
          when 1 then 'Landscape'
          when 2 then 'Portrait'
          when 3 then 'Night scene'
          else 'Unknown'
      }
      0xa407: {'name': 'GainControl', 'description': (value) ->
        switch value
          when 0 then 'None'
          when 1 then 'Low gain up'
          when 2 then 'High gain up'
          when 3 then 'Low gain down'
          when 4 then 'High gain down'
          else 'Unknown'
      }
      0xa408: {'name': 'Contrast', 'description': (value) ->
        switch value
          when 0 then 'Normal'
          when 1 then 'Soft'
          when 2 then 'Hard'
          else 'Unknown'
      }
      0xa409: {'name': 'Saturation', 'description': (value) ->
        switch value
          when 0 then 'Normal'
          when 1 then 'Low saturation'
          when 2 then 'High saturation'
          else 'Unknown'
      }
      0xa40a: {'name': 'Sharpness', 'description': (value) ->
        switch value
          when 0 then 'Normal'
          when 1 then 'Soft'
          when 2 then 'Hard'
          else 'Unknown'
      }
      0xa40b: {'name': 'DeviceSettingDescription', 'description': (value) ->
        '[Raw device settings table data]'
      }
      0xa40c: {'name': 'SubjectDistanceRange', 'description': (value) ->
        switch value
          when 1 then 'Macro'
          when 2 then 'Close view'
          when 3 then 'Distant view'
          else 'Unknown'
      }
      0xa420: 'ImageUniqueID'
    },
    'gps': {
      0x0000: {'name': 'GPSVersionID', 'description': (value) ->
        if value[0] == value[1] == 2 and value[2] == value[3] == 0
          'Version 2.2'
        else
          'Unknown'
      }
      0x0001: {'name': 'GPSLatitudeRef', 'description': (value) ->
        switch value.join ''
          when 'N' then 'North latitude'
          when 'S' then 'South latitude'
          else 'Unknown'
      }
      0x0002: {'name': 'GPSLatitude', 'description': (value) ->
        value[0] + value[1] / 60 + value[2] / 3600
      }
      0x0003: {'name': 'GPSLongitudeRef', 'description': (value) ->
        switch value.join ''
          when 'E' then 'East longitude'
          when 'W' then 'West longitude'
          else 'Unknown'
      }
      0x0004: {'name': 'GPSLongitude', 'description': (value) ->
        value[0] + value[1] / 60 + value[2] / 3600
      }
      0x0005: {'name': 'GPSAltitudeRef', 'description': (value) ->
        switch value
          when 0 then 'Sea level'
          when 1 then 'Sea level reference (negative value)'
          else 'Unknown'
      }
      0x0006: {'name': 'GPSAltitude', 'description': (value) ->
        value + ' m'
      }
      0x0007: {'name': 'GPSTimeStamp', 'description': (value) ->
        padZero = (num) ->
          ('0' for i in [0...(2 - ('' + Math.floor(num)).length)]) + num
        value.map(padZero).join ':'
      }
      0x0008: 'GPSSatellites',
      0x0009: {'name': 'GPSStatus', 'description': (value) ->
        switch value.join ''
          when 'A' then 'Measurement in progress'
          when 'V' then 'Measurement Interoperability'
          else 'Unknown'
      }
      0x000a: {'name': 'GPSMeasureMode', 'description': (value) ->
        switch value.join ''
          when '2' then '2-dimensional measurement'
          when '3' then '3-dimensional measurement'
          else 'Unknown'
      }
      0x000b: 'GPSDOP',
      0x000c: {'name': 'GPSSpeedRef', 'description': (value) ->
        switch value.join ''
          when 'K' then 'Kilometers per hour'
          when 'M' then 'Miles per hour'
          when 'N' then 'Knots'
          else 'Unknown'
      }
      0x000d: 'GPSSpeed',
      0x000e: {'name': 'GPSTrackRef', 'description': (value) ->
        switch value.join ''
          when 'T' then 'True direction'
          when 'M' then 'Magnetic direction'
          else 'Unknown'
      }
      0x000f: 'GPSTrack',
      0x0010: {'name': 'GPSImgDirectionRef', 'description': (value) ->
        switch value.join ''
          when 'T' then 'True direction'
          when 'M' then 'Magnetic direction'
          else 'Unknown'
      }
      0x0011: 'GPSImgDirection',
      0x0012: 'GPSMapDatum',
      0x0013: {'name': 'GPSDestLatitudeRef', 'description': (value) ->
        switch value.join ''
          when 'N' then 'North latitude'
          when 'S' then 'South latitude'
          else 'Unknown'
      }
      0x0014: {'name': 'GPSDestLatitude', 'description': (value) ->
        value[0] + value[1] / 60 + value[2] / 3600
      }
      0x0015: {'name': 'GPSDestLongitudeRef', 'description': (value) ->
        switch value.join ''
          when 'E' then 'East longitude'
          when 'W' then 'West longitude'
          else 'Unknown'
      }
      0x0016: {'name': 'GPSDestLongitude', 'description': (value) ->
        value[0] + value[1] / 60 + value[2] / 3600
      }
      0x0017: {'name': 'GPSDestBearingRef', 'description': (value) ->
        switch value.join ''
          when 'T' then 'True direction'
          when 'M' then 'Magnetic direction'
          else 'Unknown'
      }
      0x0018: 'GPSDestBearing',
      0x0019: {'name': 'GPSDestDistanceRef', 'description': (value) ->
        switch value.join ''
          when 'K' then 'Kilometers'
          when 'M' then 'Miles'
          when 'N' then 'Knots'
          else 'Unknown'
      }
      0x001a: 'GPSDestDistance',
      0x001b: {'name': 'GPSProcessingMethod', 'description': (value) ->
        switch value[0...8].map((charCode) -> String.fromCharCode(charCode)).join ''
          when 'ASCII\x00\x00\x00' then value[8...value.length].map((charCode) -> String.fromCharCode(charCode)).join ''
          when 'JIS\x00\x00\x00\x00\x00' then '[JIS encoded text]'
          when 'UNICODE\x00' then '[Unicode encoded text]'
          when '\x00\x00\x00\x00\x00\x00\x00\x00' then '[Undefined encoding]'
      }
      0x001c: {'name': 'GPSAreaInformation', 'description': (value) ->
        switch value[0...8].map((charCode) -> String.fromCharCode(charCode)).join ''
          when 'ASCII\x00\x00\x00' then value[8...value.length].map((charCode) -> String.fromCharCode(charCode)).join ''
          when 'JIS\x00\x00\x00\x00\x00' then '[JIS encoded text]'
          when 'UNICODE\x00' then '[Unicode encoded text]'
          when '\x00\x00\x00\x00\x00\x00\x00\x00' then '[Undefined encoding]'
      }
      0x001d: 'GPSDateStamp',
      0x001e: {'name': 'GPSDifferential', 'description': (value) ->
        switch value
          when 0 then 'Measurement without differential correction'
          when 1 then 'Differential correction applied'
          else 'Unknown'
      }
    },
    'interoperability': {
      0x0001: 'InteroperabilityIndex'
      0x0002: 'UnknownInteroperabilityTag0x0002'
      0x1001: 'UnknownInteroperabilityTag0x1001'
      0x1002: 'UnknownInteroperabilityTag0x1002'
    },
    'iptc': {
      0x015a: {'name': 'Coded Character Set', 'description': (value) =>
        switch this::_getStringValue value
          when '\x1b%G' then 'UTF-8'
          when '\x1b%/G' then 'UTF-8 Level 1'
          when '\x1b%/H' then 'UTF-8 Level 2'
          when '\x1b%/I' then 'UTF-8 Level 3'
          else 'Unknown'
      }
      0x0200: {'name': 'Record Version', 'description': (value) ->
        ((value[0] << 8) + value[1]).toString()
      }
      0x0203: 'Object Type Reference'
      0x0204: 'Object Attribute Reference'
      0x0205: 'Object Name'
      0x0207: 'Edit Status'
      0x0208: {'name': 'Editorial Update', 'description': (value) =>
        switch this::_getStringValue value
          when '01' then 'Additional Language'
          else 'Unknown'
      }
      0x020a: 'Urgency'
      0x020c: {'name': 'Subject Reference', 'repeatable': true, 'description': (value) =>
        parts = this::_getStringValue(value).split(':')
        parts[2] + (if parts[3] then '/' + parts[3] else '') + (if parts[4] then '/' + parts[4] else '')
      }
      0x020f: 'Category'
      0x0214: {'name': 'Supplemental Category', 'repeatable': true}
      0x0216: 'Fixture Identifier'
      0x0219: {'name': 'Keywords', 'repeatable': true}
      0x021a: {'name': 'Content Location Code', 'repeatable': true}
      0x021b: {'name': 'Content Location Name', 'repeatable': true}
      0x021e: 'Release Date'
      0x0223: 'Release Time'
      0x0225: 'Expiration Date'
      0x0226: 'Expiration Time'
      0x0228: 'Special Instructions'
      0x022a: {'name': 'Action Advised', 'description': (value) =>
        switch this::_getStringValue value
          when '01' then 'Object Kill'
          when '02' then 'Object Replace'
          when '03' then 'Object Append'
          when '04' then 'Object Reference'
          else 'Unknown'
      }
      0x022d: {'name': 'Reference Service', 'repeatable': true}
      0x022f: {'name': 'Reference Date', 'repeatable': true}
      0x0232: {'name': 'Reference Number', 'repeatable': true}
      0x0237: {'name': 'Date Created', 'description': (value) =>
        date = this::_getStringValue value
        if (date.length >= 8)
          date.substr(0, 4) + '-' + date.substr(4, 2) + '-' + date.substr(6, 2)
        else
          date
      }
      0x023c: {'name': 'Time Created', 'description': (value) =>
        parsedTime = time = this::_getStringValue value
        if (time.length >= 6)
          parsedTime = time.substr(0, 2) + ':' + time.substr(2, 2) + ':' + time.substr(4, 2)
          if (time.length == 11)
            parsedTime += time.substr(6, 1) + time.substr(7, 2) + ':' + time.substr(9, 2)
        parsedTime
      }
      0x023e: {'name': 'Digital Creation Date', 'description': (value) =>
        date = this::_getStringValue value
        if (date.length >= 8)
          date.substr(0, 4) + '-' + date.substr(4, 2) + '-' + date.substr(6, 2)
        else
          date
      }
      0x023f: {'name': 'Digital Creation Time', 'description': (value) =>
        parsedTime = time = this::_getStringValue value
        if (time.length >= 6)
          parsedTime = time.substr(0, 2) + ':' + time.substr(2, 2) + ':' + time.substr(4, 2)
          if (time.length == 11)
            parsedTime += time.substr(6, 1) + time.substr(7, 2) + ':' + time.substr(9, 2)
        parsedTime
      }
      0x0241: 'Originating Program'
      0x0246: 'Program Version'
      0x024b: {'name': 'Object Cycle', 'description': (value) =>
        switch this::_getStringValue value
          when 'a' then 'morning'
          when 'p' then 'evening'
          when 'b' then 'both'
          else 'Unknown'
      }
      0x0250: {'name': 'By-line', 'repeatable': true}
      0x0255: {'name': 'By-line Title', 'repeatable': true}
      0x025a: 'City'
      0x025c: 'Sub-location'
      0x025f: 'Province/State'
      0x0264: 'Country/Primary Location Code'
      0x0265: 'Country/Primary Location Name'
      0x0267: 'Original Transmission Reference'
      0x0269: 'Headline'
      0x026e: 'Credit'
      0x0273: 'Source'
      0x0274: 'Copyright Notice'
      0x0276: {'name': 'Contact', 'repeatable': true}
      0x0278: 'Caption/Abstract'
      0x027a: {'name': 'Writer/Editor', 'repeatable': true}
      0x027d: {'name': 'Rasterized Caption', 'description': (value) -> value}
      0x0282: 'Image Type'
      0x0283: {'name': 'Image Orientation', 'description': (value) =>
        switch this::_getStringValue value
          when 'P' then 'Portrait'
          when 'L' then 'Landscape'
          when 'S' then 'Square'
          else 'Unknown'
      }
      0x0287: 'Language Identifier'
      0x0296: {'name': 'Audio Type', 'description': (value) =>
        stringValue = this::_getStringValue value
        description = ''
        switch stringValue.charAt(0)
          when '1' then description += 'Mono'
          when '2' then description += 'Stereo'
        switch stringValue.charAt(1)
          when 'A' then description += ', actuality'
          when 'C' then description += ', question and answer session'
          when 'M' then description += ', music, transmitted by itself'
          when 'Q' then description += ', response to a question'
          when 'R' then description += ', raw sound'
          when 'S' then description += ', scener'
          when 'V' then description += ', voicer'
          when 'W' then description += ', wrap'
        if description != '' then description else stringValue
      }
      0x0297: {'name': 'Audio Sampling Rate', 'description': (value) =>
        parseInt(this::_getStringValue value, 10) + ' Hz'
      }
      0x0298: {'name': 'Audio Sampling Resolution', 'description': (value) =>
        bits = parseInt(this::_getStringValue value, 10)
        bits + (if bits == 1 then ' bit' else ' bits')
      }
      0x0299: {'name': 'Audio Duration', 'description': (value) =>
        duration = this::_getStringValue value
        if (duration.length >= 6)
          duration.substr(0, 2) + ':' + duration.substr(2, 2) + ':' + duration.substr(4, 2)
        else
          duration
      }
      0x029a: 'Audio Outcue'
      0x02c8: {'name': 'ObjectData Preview File Format', 'description': (value) =>
        stringValue = this::_getStringValue value
        switch stringValue
          when '00' then 'No ObjectData'
          when '01' then 'IPTC-NAA Digital Newsphoto Parameter Record'
          when '02' then 'IPTC7901 Recommended Message Format'
          when '03' then 'Tagged Image File Format (Adobe/Aldus Image data)'
          when '04' then 'Illustrator (Adobe Graphics data)'
          when '05' then 'AppleSingle (Apple Computer Inc)'
          when '06' then 'NAA 89-3 (ANPA 1312)'
          when '07' then 'MacBinary II'
          when '08' then 'IPTC Unstructured Character Oriented File Format (UCOFF)'
          when '09' then 'United Press International ANPA 1312 variant'
          when '10' then 'United Press International Down-Load Message'
          when '11' then 'JPEG File Interchange (JFIF)'
          when '12' then 'Photo-CD Image-Pac (Eastman Kodak)'
          when '13' then 'Microsoft Bit Mapped Graphics File [*.BMP]'
          when '14' then 'Digital Audio File [*.WAV] (Microsoft & Creative Labs)'
          when '15' then 'Audio plus Moving Video [*.AVI] (Microsoft)'
          when '16' then 'PC DOS/Windows Executable Files [*.COM][*.EXE]'
          when '17' then 'Compressed Binary File [*.ZIP] (PKWare Inc)'
          when '18' then 'Audio Interchange File Format AIFF (Apple Computer Inc)'
          when '19' then 'RIFF Wave (Microsoft Corporation)'
          when '20' then 'Freehand (Macromedia/Aldus)'
          when '21' then 'Hypertext Markup Language "HTML" (The Internet Society)'
          when '22' then 'MPEG 2 Audio Layer 2 (Musicom), ISO/IEC'
          when '23' then 'MPEG 2 Audio Layer 3, ISO/IEC'
          when '24' then 'Portable Document File (*.PDF) Adobe'
          when '25' then 'News Industry Text Format (NITF)'
          when '26' then 'Tape Archive (*.TAR)'
          when '27' then 'Tidningarnas Telegrambyrå NITF version (TTNITF DTD)'
          when '28' then 'Ritzaus Bureau NITF version (RBNITF DTD)'
          when '29' then 'Corel Draw [*.CDR]'
          else 'Unknown format ' + stringValue
      }
      0x02c9: {'name': 'ObjectData Preview File Format Version', 'description': (value, exif) =>
        # Format ID, Version ID, Version Description
        formatVersions = {
          '00': {'00': '1'},
          '01': {'01': '1', '02': '2', '03': '3', '04': '4'},
          '02': {'04': '4'},
          '03': {'01': '5.0', '02': '6.0'},
          '04': {'01': '1.40'},
          '05': {'01': '2'},
          '06': {'01': '1'},
          '11': {'01': '1.02'},
          '20': {'01': '3.1', '02': '4.0', '03': '5.0', '04': '5.5'},
          '21': {'02': '2.0'}
        }
        stringValue = this::_getStringValue value
        if exif._tags['ObjectData Preview File Format']? and formatVersions[this::_getStringValue(exif._tags['ObjectData Preview File Format'].value)]?[stringValue]?
          return formatVersions[this::_getStringValue(exif._tags['ObjectData Preview File Format'].value)][stringValue]
        return stringValue
      }
      0x02ca: 'ObjectData Preview Data'
    }
  }

  ###
  # Gets the image's value of the tag with the given name.
  #
  # name string The name of the tag to get the value of
  #
  # Returns the value of the tag with the given name if it exists,
  # otherwise throws "Undefined".
  ###
  getTagValue: (name) ->
    if @_tags[name]?
      return @_tags[name].value
    else
      return undefined

  ###
  # Gets the image's description of the tag with the given name.
  #
  # name string The name of the tag to get the description of
  #
  # Returns the description of the tag with the given name if it exists,
  # otherwise throws "Undefined".
  ###
  getTagDescription: (name) ->
    if @_tags[name]?
      return @_tags[name].description
    else
      return undefined

  ###
  # Gets all the image's tags.
  #
  # Returns the image's tags as an associative array: name -> description.
  ###
  getAllTags: () ->
    return @_tags
