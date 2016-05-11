###
# ExifReader 1.0.1
# http://github.com/mattiasw/exifreader
# Copyright (C) 2011-2013  Mattias Wallander <mattias@wallander.eu>
# Licensed under the GNU Lesser General Public License version 3 or later
# See license text at http://www.gnu.org/licenses/lgpl.txt
###

ExifReader = require '../src/ExifReader.coffee'
ExifReader = ExifReader.ExifReader

# Node.js doesn't have DataView.
class DataView
  constructor: (@_data) ->
    @byteLength = @_data.length

  getUint8: (offset) ->
    @_data.readUInt8 offset

  getUint16: (offset, littleEndian) ->
    if littleEndian? and littleEndian
      @_data.readUInt16LE offset
    else
      @_data.readUInt16BE offset

  getUint32: (offset, littleEndian) ->
    if littleEndian? and littleEndian
      @_data.readUInt32LE offset
    else
      @_data.readUInt32BE offset

  getInt32: (offset, littleEndian) ->
    if littleEndian? and littleEndian
      @_data.readInt32LE offset
    else
      @_data.readInt32BE offset

describe 'ExifReader', ->
  getArrayBuffer = (data) ->
    buffer = new Buffer(data.length)
    for i in [0...data.length]
      buffer[i] = data.charCodeAt i
    buffer

  getDataView = (data) ->
    dataView = new DataView getArrayBuffer(data)

  getDataViewForIptcDescription = (id, content) ->
    if content.length > 0xff
      length = String.fromCharCode(content.length >> 8) + String.fromCharCode(content.length % 256)
    else
      length = '\x00' + String.fromCharCode(content.length)
    getDataView '\x1c\x02' + String.fromCharCode(id) + length + content

  getDataViewForRepeatedIptcDescription = (tags) ->
    contents = ''
    for tag in tags
      id = tag['id']
      content = tag['content']
      if content.length > 0xff
        length = String.fromCharCode(content.length >> 8) + String.fromCharCode(content.length % 256)
      else
        length = '\x00' + String.fromCharCode(content.length)
      contents += '\x1c\x02' + String.fromCharCode(id) + length + content
    getDataView contents

  beforeEach ->
    @exif = new ExifReader
    @exif._tags = {}
    @exif._littleEndian = false
    @exif._tiffHeaderOffset = 0
    @exif._iptcDataOffset = 0

  testIptcSingle = (exif, id, tagName, tagValue, tagDescription) ->
    tagValue = 'ABC' if not tagValue?
    tagDescription = tagValue if not tagDescription?
    exif._iptcDataOffset = 0
    exif._dataView = getDataViewForIptcDescription(id, tagValue)
    tag = exif._readIptcTag()
    expect(tag.name).toEqual tagName
    expect(tag.description).toEqual tagDescription

  testIptcRepeated = (exif, id, tagName, tagValues, tagDescriptions) ->
    tagValues = ['ABC', 'DEF'] if not tagValues?
    tagDescriptions = tagValues if not tagDescriptions?
    # Have to go to higher level than readIptcTag, i.e. parseIptcTags.
    exif._dataView = getDataViewForRepeatedIptcDescription(
      {'id': id, 'content': tagValue} for tagValue in tagValues
    )
    exif._iptcDataOffset = -12
    naaBlock = {'type': 0x0404, 'size': exif._dataView.length}
    exif._parseIptcTags(naaBlock)
    for i in [0...tagValues.length]
      expect(exif._tags[tagName][i].description).toEqual tagDescriptions[i]

  testIptcFileFormatVersion = (exif, formatId, versionNo, versionDesc) ->
    exif._iptcDataOffset = 0
    exif._dataView = getDataView '\x1c\x02' + String.fromCharCode(200) + '\x00\x02' + formatId + '\x1c\x02' + String.fromCharCode(201) + '\x00\x02' + versionNo
    exif._tags['ObjectData Preview File Format'] = exif._readIptcTag()
    tag = exif._readIptcTag()
    expect(tag.description).toEqual versionDesc

  it 'should fail for too short data buffer', ->
    exif = @exif
    exif._dataView = getDataView '\x00'
    expect(-> exif._checkImageHeader()).toThrow(new Error 'Invalid image format')

  it 'should accept well-formed header of JPEG image data', ->
    @exif._dataView = getDataView '\xff\xd8\xff\xe100Exif\x00\x00'
    @exif._checkImageHeader()

  it 'should fail for invalid image format', ->
    exif = @exif
    exif._dataView = getDataView '------------'
    expect(-> exif._checkImageHeader()).toThrow(new Error 'Invalid image format')

  it 'should fail when no Exif identifier for APP1', ->
    exif = @exif
    expect(-> exif.loadView(getDataView '\xff\xd8\xff\xe1--------')).toThrow(new Error 'No Exif data')

  it 'should handle APP2 markers', ->
    @exif._dataView = getDataView '\xff\xd8\xff\xe0\x00\x07JFIF\x00\xff\xe2\x00\x07XXXX\x00\xff\xe0\x00\x07JFXX\x00\xff\xe1\x47\x11Exif\x00\x00'
    @exif._checkImageHeader()
    expect(@exif._tiffHeaderOffset).toEqual 39

  it 'should handle JFIF APP0 markers', ->
    @exif._dataView = getDataView '\xff\xd8\xff\xe0\x00\x07JFIF\x00\xff\xe1\x47\x11Exif\x00\x00'
    @exif._checkImageHeader()
    expect(@exif._tiffHeaderOffset).toEqual 21

  it 'should handle JFXX APP0 markers', ->
    @exif._dataView = getDataView '\xff\xd8\xff\xe0\x00\x07JFIF\x00\xff\xe0\x00\x07JFXX\x00\xff\xe1\x47\x11Exif\x00\x00'
    @exif._checkImageHeader()
    expect(@exif._tiffHeaderOffset).toEqual 30

  it 'should handle unknown high ID APP markers', ->
    @exif._dataView = getDataView '\xff\xd8\xff\xea\x00\x07XXXX\x00\xff\xe1\x47\x11Exif\x00\x00'
    @exif._checkImageHeader()
    expect(@exif._tiffHeaderOffset).toEqual 21

  it 'should handle reversed order of JFIF-Exif hybrid', ->
    @exif._dataView = getDataView '\xff\xd8\xff\xe1\x00\x08Exif\x00\x00\xff\xe0\x00\x07JFIF\x00'
    @exif._checkImageHeader()
    expect(@exif._tiffHeaderOffset).toEqual 12

  it 'should handle IPTC APP13 markers', ->
    @exif._dataView = getDataView '\xff\xd8\xff\xed\x00\x10Photoshop 3.0\x00'
    @exif._checkImageHeader()
    #expect(@exif._tiffHeaderOffset).toEqual 39

  it 'should handle IPTC Comment markers', ->
    @exif._dataView = getDataView '\xff\xd8\xff\xfe\x00+Optimized by JPEGmin'
    @exif._checkImageHeader()

  it 'should fail gracefully for faulty APP markers', ->
    exif = @exif
    expect(->
      exif.loadView(getDataView '\xff\xd8\xfe\xdc\x00\x6fJFIF\x65\x01\x01\x01\x00\x48')
    ).toThrow(new Error 'No Exif data')

  it 'should find byte order data', ->
    @exif._dataView = getDataView '\xff\xd8\xff\xe100Exif\x00\x00\x49\x49'
    @exif._checkImageHeader()
    @exif._setByteOrder()
    expect(@exif._littleEndian).toBeTruthy()

  it 'should set correct byte order for litte endian data', ->
    @exif._dataView = getDataView '\x49\x49'
    @exif._setByteOrder()
    expect(@exif._littleEndian).toBeTruthy()

  it 'should set correct byte order for big endian data', ->
    @exif._dataView = getDataView '\x4d\x4d'
    @exif._setByteOrder()
    expect(@exif._littleEndian).toBeFalsy()

  it 'should not allow illegal byte order value', ->
    exif = @exif
    exif._dataView = getDataView '\x00\x00'
    expect(-> exif._setByteOrder()).toThrow(new Error 'Illegal byte order value. Faulty image.')

  it 'should correctly read offset of 0th IFD for little endian data', ->
    @exif._dataView = getDataView '\x49\x49\x00\x2a\x08\x00\x00\x00'
    @exif._setByteOrder()
    expect(@exif._getIfdOffset(0)).toEqual 8

  it 'should correctly read offset of 0th IFD for big endian data', ->
    @exif._dataView = getDataView '\x4d\x4d\x00\x2a\x00\x00\x00\x08'
    @exif._setByteOrder()
    expect(@exif._getIfdOffset(0)).toEqual 8

  it 'should be able to read a byte', ->
    @exif._dataView = getDataView '\x42'
    expect(@exif._getByteAt(0)).toEqual 0x42

  it 'should be able to read an ASCII text', ->
    @exif._dataView = getDataView 'String\x00'
    expect(@exif._getAsciiAt(0)).toEqual 'S'.charCodeAt(0)

  it 'should be able to read a little endian short', ->
    @exif._dataView = getDataView '\x11\x47'
    @exif._littleEndian = true
    expect(@exif._getShortAt(0)).toEqual 0x4711

  it 'should be able to read a big endian short', ->
    @exif._dataView = getDataView '\x47\x11'
    @exif._littleEndian = false
    expect(@exif._getShortAt(0)).toEqual 0x4711

  it 'should be able to read a little endian long', ->
    @exif._dataView = getDataView '\x45\x44\x43\x42'
    @exif._littleEndian = true
    expect(@exif._getLongAt(0)).toEqual 0x42434445

  it 'should be able to read a big endian long', ->
    @exif._dataView = getDataView '\x42\x43\x44\x45'
    @exif._littleEndian = false
    expect(@exif._getLongAt(0)).toEqual 0x42434445

  it 'should be able to read a little endian rational', ->
    @exif._dataView = getDataView '\x45\x44\x43\x42\x49\x48\x47\x46'
    @exif._littleEndian = true
    expect(@exif._getRationalAt(0)).toEqual 0x42434445/0x46474849

  it 'should be able to read a big endian rational', ->
    @exif._dataView = getDataView '\x42\x43\x44\x45\x46\x47\x48\x49'
    @exif._littleEndian = false
    expect(@exif._getRationalAt(0)).toEqual 0x42434445/0x46474849

  it 'should be able to read an undefined', ->
    @exif._dataView = getDataView '\x42'
    expect(@exif._getUndefinedAt(0)).toEqual 0x42

  it 'should be able to read a little endian slong', ->
    @exif._dataView = getDataView '\xbe\xff\xff\xff'
    @exif._littleEndian = true
    expect(@exif._getSlongAt(0)).toEqual -0x42

  it 'should be able to read a big endian slong', ->
    @exif._dataView = getDataView '\xff\xff\xff\xbe'
    @exif._littleEndian = false
    expect(@exif._getSlongAt(0)).toEqual -0x42

  it 'should be able to read a little endian srational', ->
    @exif._dataView = getDataView '\xbe\xff\xff\xff\x49\x48\x47\x46'
    @exif._littleEndian = true
    expect(@exif._getSrationalAt(0)).toEqual -0x42/0x46474849

  it 'should be able to read a big endian srational', ->
    @exif._dataView = getDataView '\xff\xff\xff\xbe\x46\x47\x48\x49'
    @exif._littleEndian = false
    expect(@exif._getSrationalAt(0)).toEqual -0x42/0x46474849

  it 'should be able to get ASCII value', ->
    expect(@exif._getAsciiValue(['S'.charCodeAt(0), 't'.charCodeAt(0), 'r'.charCodeAt(0), 'i'.charCodeAt(0), 'n'.charCodeAt(0), 'g'.charCodeAt(0), 0x00]).join('')).toEqual 'String\x00'

  it 'should be able to get IFD offset', ->
    @exif._dataView = getDataView '\x00\x00\x00\x00\x00\x2a\x47\x11\x48\x12'
    @exif._tiffHeaderOffset = 2
    expect(@exif._getIfdOffset()).toEqual @exif._tiffHeaderOffset + 0x47114812

  it 'should be able to read a one-field IFD', ->
    # field count + field
    @exif._dataView = getDataView '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00'
    @exif._tagNames['0th'][0x4711] = 'MyExifTag'
    @exif._readIfd '0th', 0
    expect(@exif.getTagDescription('MyExifTag')).toEqual 0x42

  it 'should be able to read a multi-field IFD', ->
    # field count + 1st field + 2nd field
    @exif._dataView = getDataView('\x00\x02' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x47\x12\x00\x01\x00\x00\x00\x01\x43\x00\x00\x00')
    @exif._tagNames['0th'][0x4711] = 'MyExifTag0'
    @exif._tagNames['0th'][0x4712] = 'MyExifTag1'
    @exif._readIfd '0th', 0
    expect(@exif.getTagDescription('MyExifTag0')).toEqual 0x42
    expect(@exif.getTagDescription('MyExifTag1')).toEqual 0x43

  it 'should be able to read short ASCII tag', ->
    @exif._tagNames['0th'][0x4711] = 'MyAsciiTag'
    @exif._dataView = getDataView '\x47\x11\x00\x02\x00\x00\x00\x04\x41\x42\x43\x00'
    expect(@exif._readTag('0th', 0).description).toEqual 'ABC'

  it 'should be able to read long ASCII tag', ->
    @exif._tagNames['0th'][0x4711] = 'MyAsciiTag'
    @exif._dataView = getDataView '\x47\x11\x00\x02\x00\x00\x00\x06\x00\x00\x00\x0c\x41\x42\x43\x44\x45\x00'
    expect(@exif._readTag('0th', 0).description).toEqual 'ABCDE'

  it 'should return undefined value for undefined tag names', ->
    exif = @exif
    expect(exif.getTagValue('MyUndefinedTagName')).toBeUndefined()

  it 'should return undefined description for undefined tag names', ->
    exif = @exif
    expect(exif.getTagDescription('MyUndefinedTagName')).toBeUndefined()

  # Parsing tag descriptions.

  getOrientationView = (o) -> getDataView('\x01\x12\x00\x03\x00\x00\x00\x01\x00' + o + '\x00\x00')

  it 'should report correct description for Orientation', ->
    @exif._dataView = getOrientationView '\x01'
    expect(@exif._readTag('0th', 0).description).toEqual 'top-left'
    @exif._dataView = getOrientationView '\x02'
    expect(@exif._readTag('0th', 0).description).toEqual 'top-right'
    @exif._dataView = getOrientationView '\x03'
    expect(@exif._readTag('0th', 0).description).toEqual 'bottom-right'
    @exif._dataView = getOrientationView '\x04'
    expect(@exif._readTag('0th', 0).description).toEqual 'bottom-left'
    @exif._dataView = getOrientationView '\x05'
    expect(@exif._readTag('0th', 0).description).toEqual 'left-top'
    @exif._dataView = getOrientationView '\x06'
    expect(@exif._readTag('0th', 0).description).toEqual 'right-top'
    @exif._dataView = getOrientationView '\x07'
    expect(@exif._readTag('0th', 0).description).toEqual 'right-bottom'
    @exif._dataView = getOrientationView '\x08'
    expect(@exif._readTag('0th', 0).description).toEqual 'left-bottom'

  it 'should report correct description for YCbCrPositioning', ->
    @exif._dataView = getDataView '\x02\x13\x00\x03\x00\x00\x00\x01\x00\x01\x00\x00'
    expect(@exif._readTag('0th', 0).description).toEqual 'centered'
    @exif._dataView = getDataView '\x02\x13\x00\x03\x00\x00\x00\x01\x00\x02\x00\x00'
    expect(@exif._readTag('0th', 0).description).toEqual 'co-sited'

  it 'should report correct description for ResolutionUnit', ->
    @exif._dataView = getDataView '\x01\x28\x00\x03\x00\x00\x00\x01\x00\x02\x00\x00'
    expect(@exif._readTag('0th', 0).description).toEqual 'inches'
    @exif._dataView = getDataView '\x01\x28\x00\x03\x00\x00\x00\x01\x00\x03\x00\x00'
    expect(@exif._readTag('0th', 0).description).toEqual 'centimeters'

  it 'should report correct description for Copyright', ->
    # A NULL B NULL
    @exif._dataView = getDataView '\x82\x98\x00\x02\x00\x00\x00\x04\x41\x00\x42\x00'
    expect(@exif._readTag('0th', 0).description).toEqual 'A; B'

  it 'should report correct description for ExifVersion', ->
    @exif._dataView = getDataView '\x90\x00\x00\x07\x00\x00\x00\x04\x30\x32\x32\x30'
    expect(@exif._readTag('exif', 0).description).toEqual '0220'

  it 'should report correct description for FlashpixVersion', ->
    @exif._dataView = getDataView '\xa0\x00\x00\x07\x00\x00\x00\x04\x30\x31\x30\x30'
    expect(@exif._readTag('exif', 0).description).toEqual '0100'

  it 'should report correct description for ColorSpace', ->
    @exif._dataView = getDataView '\xa0\x01\x00\x03\x00\x00\x00\x01\x00\x01\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'sRGB'
    @exif._dataView = getDataView '\xa0\x01\x00\x03\x00\x00\x00\x01\xff\xff\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Uncalibrated'

  it 'should report correct description for ComponentsConfiguration', ->
    @exif._dataView = getDataView '\x91\x01\x00\x07\x00\x00\x00\x04\x34\x35\x36\x30'
    expect(@exif._readTag('exif', 0).description).toEqual 'RGB'
    @exif._dataView = getDataView '\x91\x01\x00\x07\x00\x00\x00\x04\x31\x32\x33\x30'
    expect(@exif._readTag('exif', 0).description).toEqual 'YCbCr'

  it 'should report correct text for ASCII UserComment', ->
    @exif._dataView = getDataView '\x92\x86\x00\x07\x00\x00\x00\x0b\x00\x00\x00\x0cASCII\x00\x00\x00ABC'
    expect(@exif._readTag('exif', 0).description).toEqual 'ABC'

  it 'should report correct character code for UserComment', ->
    @exif._dataView = getDataView '\x92\x86\x00\x07\x00\x00\x00\x08\x00\x00\x00\x0cJIS\x00\x00\x00\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual '[JIS encoded text]'
    @exif._dataView = getDataView '\x92\x86\x00\x07\x00\x00\x00\x08\x00\x00\x00\x0cUNICODE\x00'
    expect(@exif._readTag('exif', 0).description).toEqual '[Unicode encoded text]'
    @exif._dataView = getDataView '\x92\x86\x00\x07\x00\x00\x00\x08\x00\x00\x00\x0c\x00\x00\x00\x00\x00\x00\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual '[Undefined encoding]'

  it 'should report correct description for ExposureProgram', ->
    @exif._dataView = getDataView '\x88\x22\x00\x03\x00\x00\x00\x01\x00\x00\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Undefined'
    @exif._dataView = getDataView '\x88\x22\x00\x03\x00\x00\x00\x01\x00\x01\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Manual'
    @exif._dataView = getDataView '\x88\x22\x00\x03\x00\x00\x00\x01\x00\x02\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Normal program'
    @exif._dataView = getDataView '\x88\x22\x00\x03\x00\x00\x00\x01\x00\x03\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Aperture priority'
    @exif._dataView = getDataView '\x88\x22\x00\x03\x00\x00\x00\x01\x00\x04\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Shutter priority'
    @exif._dataView = getDataView '\x88\x22\x00\x03\x00\x00\x00\x01\x00\x05\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Creative program'
    @exif._dataView = getDataView '\x88\x22\x00\x03\x00\x00\x00\x01\x00\x06\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Action program'
    @exif._dataView = getDataView '\x88\x22\x00\x03\x00\x00\x00\x01\x00\x07\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Portrait mode'
    @exif._dataView = getDataView '\x88\x22\x00\x03\x00\x00\x00\x01\x00\x08\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Landscape mode'
    @exif._dataView = getDataView '\x88\x22\x00\x03\x00\x00\x00\x01\x00\x09\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Unknown'

  it 'should report correct description for MeteringMode', ->
    @exif._dataView = getDataView '\x92\x07\x00\x03\x00\x00\x00\x01\x00\x01\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Average'
    @exif._dataView = getDataView '\x92\x07\x00\x03\x00\x00\x00\x01\x00\x02\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'CenterWeightedAverage'
    @exif._dataView = getDataView '\x92\x07\x00\x03\x00\x00\x00\x01\x00\x03\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Spot'
    @exif._dataView = getDataView '\x92\x07\x00\x03\x00\x00\x00\x01\x00\x04\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'MultiSpot'
    @exif._dataView = getDataView '\x92\x07\x00\x03\x00\x00\x00\x01\x00\x05\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Pattern'
    @exif._dataView = getDataView '\x92\x07\x00\x03\x00\x00\x00\x01\x00\x06\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Partial'
    @exif._dataView = getDataView '\x92\x07\x00\x03\x00\x00\x00\x01\x00\xff\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Other'
    @exif._dataView = getDataView '\x92\x07\x00\x03\x00\x00\x00\x01\x00\x00\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Unknown'

  it 'should report correct description for LightSource', ->
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x01\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Daylight'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x02\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Fluorescent'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x03\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Tungsten (incandescent light)'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x04\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x09\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Fine weather'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x0a\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Cloudy weather'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x0b\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Shade'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x0c\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Daylight fluorescent (D 5700 – 7100K)'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x0d\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Day white fluorescent (N 4600 – 5400K)'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x0e\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Cool white fluorescent (W 3900 – 4500K)'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x0f\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'White fluorescent (WW 3200 – 3700K)'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x11\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Standard light A'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x12\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Standard light B'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x13\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Standard light C'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x14\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'D55'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x15\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'D65'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x16\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'D75'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x17\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'D50'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x18\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'ISO studio tungsten'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\xff\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Other light source'
    @exif._dataView = getDataView '\x92\x08\x00\x03\x00\x00\x00\x01\x00\x00\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Unknown'

  it 'should report correct description for Flash', ->
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x00\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash did not fire'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x01\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash fired'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x05\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Strobe return light not detected'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x07\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Strobe return light detected'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x09\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash fired, compulsory flash mode'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x0d\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash fired, compulsory flash mode, return light not detected'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x0f\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash fired, compulsory flash mode, return light detected'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x10\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash did not fire, compulsory flash mode'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x18\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash did not fire, auto mode'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x19\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash fired, auto mode'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x1d\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash fired, auto mode, return light not detected'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x1f\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash fired, auto mode, return light detected'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x20\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'No flash function'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x41\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash fired, red-eye reduction mode'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x45\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash fired, red-eye reduction mode, return light not detected'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x47\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash fired, red-eye reduction mode, return light detected'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x49\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash fired, compulsory flash mode, red-eye reduction mode'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x4d\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash fired, compulsory flash mode, red-eye reduction mode, return light not detected'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x4f\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash fired, compulsory flash mode, red-eye reduction mode, return light detected'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x59\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash fired, auto mode, red-eye reduction mode'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x5d\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash fired, auto mode, return light not detected, red-eye reduction mode'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x5f\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Flash fired, auto mode, return light detected, red-eye reduction mode'
    @exif._dataView = getDataView '\x92\x09\x00\x03\x00\x00\x00\x01\x00\x60\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Unknown'

  it 'should report correct description for SubjectArea', ->
    @exif._dataView = getDataView '\x92\x14\x00\x03\x00\x00\x00\x02\x47\x11\x48\x12'
    expect(@exif._readTag('exif', 0).description).toEqual 'Location; X: 18193, Y: 18450'
    @exif._dataView = getDataView '\x92\x14\x00\x03\x00\x00\x00\x03\x00\x00\x00\x0c\x47\x11\x48\x12\x00\x42'
    expect(@exif._readTag('exif', 0).description).toEqual 'Circle; X: 18193, Y: 18450, diameter: 66'
    @exif._dataView = getDataView '\x92\x14\x00\x03\x00\x00\x00\x04\x00\x00\x00\x0c\x47\x11\x48\x12\x00\x42\x00\x43'
    expect(@exif._readTag('exif', 0).description).toEqual 'Rectangle; X: 18193, Y: 18450, width: 66, height: 67'

  it 'should report correct description for FocalPlaneResolutionUnit', ->
    @exif._dataView = getDataView '\xa2\x10\x00\x03\x00\x00\x00\x01\x00\x02\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'inches'
    @exif._dataView = getDataView '\xa2\x10\x00\x03\x00\x00\x00\x01\x00\x03\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'centimeters'

  it 'should report correct description for SubjectLocation', ->
    @exif._dataView = getDataView '\xa2\x14\x00\x03\x00\x00\x00\x02\x47\x11\x48\x12'
    expect(@exif._readTag('exif', 0).description).toEqual 'X: 18193, Y: 18450'

  it 'should report correct description for SensingMethod', ->
    @exif._dataView = getDataView '\xa2\x17\x00\x03\x00\x00\x00\x01\x00\x01\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Undefined'
    @exif._dataView = getDataView '\xa2\x17\x00\x03\x00\x00\x00\x01\x00\x02\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'One-chip color area sensor'
    @exif._dataView = getDataView '\xa2\x17\x00\x03\x00\x00\x00\x01\x00\x03\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Two-chip color area sensor'
    @exif._dataView = getDataView '\xa2\x17\x00\x03\x00\x00\x00\x01\x00\x04\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Three-chip color area sensor'
    @exif._dataView = getDataView '\xa2\x17\x00\x03\x00\x00\x00\x01\x00\x05\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Color sequential area sensor'
    @exif._dataView = getDataView '\xa2\x17\x00\x03\x00\x00\x00\x01\x00\x07\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Trilinear sensor'
    @exif._dataView = getDataView '\xa2\x17\x00\x03\x00\x00\x00\x01\x00\x08\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Color sequential linear sensor'

  it 'should report correct description for FileSource', ->
    @exif._dataView = getDataView '\xa3\x00\x00\x07\x00\x00\x00\x01\x03\x00\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'DSC'

  it 'should report correct description for SceneType', ->
    @exif._dataView = getDataView '\xa3\x01\x00\x07\x00\x00\x00\x01\x01\x00\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'A directly photographed image'

  it 'should report correct description for CustomRendered', ->
    @exif._dataView = getDataView '\xa4\x01\x00\x03\x00\x00\x00\x01\x00\x00\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Normal process'
    @exif._dataView = getDataView '\xa4\x01\x00\x03\x00\x00\x00\x01\x00\x01\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Custom process'

  it 'should report correct description for ExposureMode', ->
    @exif._dataView = getDataView '\xa4\x02\x00\x03\x00\x00\x00\x01\x00\x00\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Auto exposure'
    @exif._dataView = getDataView '\xa4\x02\x00\x03\x00\x00\x00\x01\x00\x01\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Manual exposure'
    @exif._dataView = getDataView '\xa4\x02\x00\x03\x00\x00\x00\x01\x00\x02\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Auto bracket'

  it 'should report correct description for WhiteBalance', ->
    @exif._dataView = getDataView '\xa4\x03\x00\x03\x00\x00\x00\x01\x00\x00\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Auto white balance'
    @exif._dataView = getDataView '\xa4\x03\x00\x03\x00\x00\x00\x01\x00\x01\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Manual white balance'

  it 'should report correct description for DigitalZoomRatio', ->
    @exif._dataView = getDataView '\xa4\x04\x00\x05\x00\x00\x00\x01\x00\x00\x00\x0c\x00\x00\x00\x00\x00\x00\x00\x42'
    expect(@exif._readTag('exif', 0).description).toEqual 'Digital zoom was not used'
    @exif._dataView = getDataView '\xa4\x04\x00\x05\x00\x00\x00\x01\x00\x00\x00\x0c\x00\x00\x47\x11\x00\x00\x00\x42'
    expect(@exif._readTag('exif', 0).description).toBeCloseTo(275.6515, 4)

  it 'should report correct description for FocalLengthIn35mmFilm', ->
    @exif._dataView = getDataView '\xa4\x05\x00\x03\x00\x00\x00\x01\x00\x00\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Unknown'
    @exif._dataView = getDataView '\xa4\x05\x00\x03\x00\x00\x00\x01\x00\x42\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 0x42

  it 'should report correct description for SceneCaptureType', ->
    @exif._dataView = getDataView '\xa4\x06\x00\x03\x00\x00\x00\x01\x00\x00\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Standard'
    @exif._dataView = getDataView '\xa4\x06\x00\x03\x00\x00\x00\x01\x00\x01\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Landscape'
    @exif._dataView = getDataView '\xa4\x06\x00\x03\x00\x00\x00\x01\x00\x02\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Portrait'
    @exif._dataView = getDataView '\xa4\x06\x00\x03\x00\x00\x00\x01\x00\x03\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Night scene'

  it 'should report correct description for GainControl', ->
    @exif._dataView = getDataView '\xa4\x07\x00\x03\x00\x00\x00\x01\x00\x00\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'None'
    @exif._dataView = getDataView '\xa4\x07\x00\x03\x00\x00\x00\x01\x00\x01\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Low gain up'
    @exif._dataView = getDataView '\xa4\x07\x00\x03\x00\x00\x00\x01\x00\x02\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'High gain up'
    @exif._dataView = getDataView '\xa4\x07\x00\x03\x00\x00\x00\x01\x00\x03\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Low gain down'
    @exif._dataView = getDataView '\xa4\x07\x00\x03\x00\x00\x00\x01\x00\x04\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'High gain down'

  it 'should report correct description for Contrast', ->
    @exif._dataView = getDataView '\xa4\x08\x00\x03\x00\x00\x00\x01\x00\x00\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Normal'
    @exif._dataView = getDataView '\xa4\x08\x00\x03\x00\x00\x00\x01\x00\x01\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Soft'
    @exif._dataView = getDataView '\xa4\x08\x00\x03\x00\x00\x00\x01\x00\x02\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Hard'

  it 'should report correct description for Saturation', ->
    @exif._dataView = getDataView '\xa4\x09\x00\x03\x00\x00\x00\x01\x00\x00\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Normal'
    @exif._dataView = getDataView '\xa4\x09\x00\x03\x00\x00\x00\x01\x00\x01\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Low saturation'
    @exif._dataView = getDataView '\xa4\x09\x00\x03\x00\x00\x00\x01\x00\x02\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'High saturation'

  it 'should report correct description for Sharpness', ->
    @exif._dataView = getDataView '\xa4\x0a\x00\x03\x00\x00\x00\x01\x00\x00\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Normal'
    @exif._dataView = getDataView '\xa4\x0a\x00\x03\x00\x00\x00\x01\x00\x01\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Soft'
    @exif._dataView = getDataView '\xa4\x0a\x00\x03\x00\x00\x00\x01\x00\x02\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Hard'

  it 'should report correct description for SubjectDistanceRange', ->
    @exif._dataView = getDataView '\xa4\x0c\x00\x03\x00\x00\x00\x01\x00\x00\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Unknown'
    @exif._dataView = getDataView '\xa4\x0c\x00\x03\x00\x00\x00\x01\x00\x01\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Macro'
    @exif._dataView = getDataView '\xa4\x0c\x00\x03\x00\x00\x00\x01\x00\x02\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Close view'
    @exif._dataView = getDataView '\xa4\x0c\x00\x03\x00\x00\x00\x01\x00\x03\x00\x00'
    expect(@exif._readTag('exif', 0).description).toEqual 'Distant view'

  it 'should report correct description for GPSVersionID', ->
    @exif._dataView = getDataView '\x00\x00\x00\x01\x00\x00\x00\x04\x02\x02\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'Version 2.2'

  it 'should report correct description for GPSLatitudeRef', ->
    @exif._dataView = getDataView '\x00\x01\x00\x02\x00\x00\x00\x02N\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'North latitude'
    @exif._dataView = getDataView '\x00\x01\x00\x02\x00\x00\x00\x02S\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'South latitude'

  it 'should report correct description for GPSLatitude', ->
    # 37.231969, 115.811119 (37° 13' 55.0878", 115° 48' 40.0284")
    @exif._dataView = getDataView '\x00\x02\x00\x05\x00\x00\x00\x03\x00\x00\x00\x0c' + '\x00\x00\x00\x25\x00\x00\x00\x01' + '\x00\x00\x00\x0d\x00\x00\x00\x01' + '\x00\x08\x67\xde\x00\x00\x27\x10'
    expect(@exif._readTag('gps', 0).description).toBeCloseTo(37.231969, 6)

  it 'should report correct description for GPSLongitudeRef', ->
    @exif._dataView = getDataView '\x00\x03\x00\x02\x00\x00\x00\x02E\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'East longitude'
    @exif._dataView = getDataView '\x00\x03\x00\x02\x00\x00\x00\x02W\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'West longitude'

  it 'should report correct description for GPSLongitude', ->
    # 37.231969, 115.811119 (37° 13' 55.0878", 115° 48' 40.0284")
    @exif._dataView = getDataView '\x00\x04\x00\x05\x00\x00\x00\x03\x00\x00\x00\x0c' + '\x00\x00\x00\x73\x00\x00\x00\x01' + '\x00\x00\x00\x30\x00\x00\x00\x01' + '\x00\x06\x1b\x9c\x00\x00\x27\x10'
    expect(@exif._readTag('gps', 0).description).toBeCloseTo(115.811119, 6)

  it 'should report correct description for GPSAltitudeRef', ->
    @exif._dataView = getDataView '\x00\x05\x00\x01\x00\x00\x00\x01\x00\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'Sea level'
    @exif._dataView = getDataView '\x00\x05\x00\x01\x00\x00\x00\x01\x01\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'Sea level reference (negative value)'

  it 'should report correct description for GPSAltitude', ->
    @exif._dataView = getDataView '\x00\x06\x00\x05\x00\x00\x00\x01\x00\x00\x00\x0c' + '\x00\x00\x00\x2a\x00\x00\x00\x01'
    expect(@exif._readTag('gps', 0).description).toEqual '42 m'

  it 'should report correct description for GPSTimeStamp', ->
    @exif._dataView = getDataView '\x00\x07\x00\x05\x00\x00\x00\x03\x00\x00\x00\x0c' + '\x00\x00\x00\x06\x00\x00\x00\x01' + '\x00\x00\x00\x07\x00\x00\x00\x01' + '\x00\x00\x0c\xb0\x00\x00\x00\x64'
    expect(@exif._readTag('gps', 0).description).toEqual '06:07:32.48'
    @exif._dataView = getDataView '\x00\x07\x00\x05\x00\x00\x00\x03\x00\x00\x00\x0c' + '\x00\x00\x00\x06\x00\x00\x00\x01' + '\x00\x00\x00\x00\x00\x00\x00\x01' + '\x00\x00\x0c\xb0\x00\x00\x00\x64'
    expect(@exif._readTag('gps', 0).description).toEqual '06:00:32.48'

  it 'should report correct description for GPSStatus', ->
    @exif._dataView = getDataView '\x00\x09\x00\x02\x00\x00\x00\x02A\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'Measurement in progress'
    @exif._dataView = getDataView '\x00\x09\x00\x02\x00\x00\x00\x02V\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'Measurement Interoperability'

  it 'should report correct description for GPSMeasureMode', ->
    @exif._dataView = getDataView '\x00\x0a\x00\x02\x00\x00\x00\x022\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual '2-dimensional measurement'
    @exif._dataView = getDataView '\x00\x0a\x00\x02\x00\x00\x00\x023\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual '3-dimensional measurement'

  it 'should report correct description for GPSSpeedRef', ->
    @exif._dataView = getDataView '\x00\x0c\x00\x02\x00\x00\x00\x02K\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'Kilometers per hour'
    @exif._dataView = getDataView '\x00\x0c\x00\x02\x00\x00\x00\x02M\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'Miles per hour'
    @exif._dataView = getDataView '\x00\x0c\x00\x02\x00\x00\x00\x02N\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'Knots'

  it 'should report correct description for GPSTrackRef', ->
    @exif._dataView = getDataView '\x00\x0e\x00\x02\x00\x00\x00\x02T\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'True direction'
    @exif._dataView = getDataView '\x00\x0e\x00\x02\x00\x00\x00\x02M\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'Magnetic direction'

  it 'should report correct description for GPSImgDirectionRef', ->
    @exif._dataView = getDataView '\x00\x10\x00\x02\x00\x00\x00\x02T\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'True direction'
    @exif._dataView = getDataView '\x00\x10\x00\x02\x00\x00\x00\x02M\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'Magnetic direction'

  it 'should report correct description for GPSDestLatitudeRef', ->
    @exif._dataView = getDataView '\x00\x13\x00\x02\x00\x00\x00\x02N\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'North latitude'
    @exif._dataView = getDataView '\x00\x13\x00\x02\x00\x00\x00\x02S\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'South latitude'

  it 'should report correct description for GPSDestLatitude', ->
    # 37.231969, 115.811119 (37° 13' 55.0878", 115° 48' 40.0284")
    @exif._dataView = getDataView '\x00\x14\x00\x05\x00\x00\x00\x03\x00\x00\x00\x0c' + '\x00\x00\x00\x25\x00\x00\x00\x01' + '\x00\x00\x00\x0d\x00\x00\x00\x01' + '\x00\x08\x67\xde\x00\x00\x27\x10'
    expect(@exif._readTag('gps', 0).description).toBeCloseTo(37.231969, 6)

  it 'should report correct description for GPSDestLongitudeRef', ->
    @exif._dataView = getDataView '\x00\x15\x00\x02\x00\x00\x00\x02E\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'East longitude'
    @exif._dataView = getDataView '\x00\x15\x00\x02\x00\x00\x00\x02W\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'West longitude'

  it 'should report correct description for GPSDestLongitude', ->
    # 37.231969, 115.811119 (37° 13' 55.0878", 115° 48' 40.0284")
    @exif._dataView = getDataView '\x00\x16\x00\x05\x00\x00\x00\x03\x00\x00\x00\x0c' + '\x00\x00\x00\x73\x00\x00\x00\x01' + '\x00\x00\x00\x30\x00\x00\x00\x01' + '\x00\x06\x1b\x9c\x00\x00\x27\x10'
    expect(@exif._readTag('gps', 0).description).toBeCloseTo(115.811119, 6)

  it 'should report correct description for GPSDestBearingRef', ->
    @exif._dataView = getDataView '\x00\x17\x00\x02\x00\x00\x00\x02T\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'True direction'
    @exif._dataView = getDataView '\x00\x0e\x00\x02\x00\x00\x00\x02M\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'Magnetic direction'

  it 'should report correct description for GPSDestDistanceRef', ->
    @exif._dataView = getDataView '\x00\x19\x00\x02\x00\x00\x00\x02K\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'Kilometers'
    @exif._dataView = getDataView '\x00\x19\x00\x02\x00\x00\x00\x02M\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'Miles'
    @exif._dataView = getDataView '\x00\x19\x00\x02\x00\x00\x00\x02N\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'Knots'

  it 'should report correct description for GPSDifferential', ->
    @exif._dataView = getDataView '\x00\x1e\x00\x03\x00\x00\x00\x01\x00\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'Measurement without differential correction'
    @exif._dataView = getDataView '\x00\x1e\x00\x03\x00\x00\x00\x01\x00\x01\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual 'Differential correction applied'

  it 'should report correct text for ASCII GPSProcessingMethod', ->
    @exif._dataView = getDataView '\x00\x1b\x00\x07\x00\x00\x00\x0b\x00\x00\x00\x0cASCII\x00\x00\x00ABC'
    expect(@exif._readTag('gps', 0).description).toEqual 'ABC'

  it 'should report correct character code for GPSProcessingMethod', ->
    @exif._dataView = getDataView '\x00\x1b\x00\x07\x00\x00\x00\x08\x00\x00\x00\x0cJIS\x00\x00\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual '[JIS encoded text]'
    @exif._dataView = getDataView '\x00\x1b\x00\x07\x00\x00\x00\x08\x00\x00\x00\x0cUNICODE\x00'
    expect(@exif._readTag('gps', 0).description).toEqual '[Unicode encoded text]'
    @exif._dataView = getDataView '\x00\x1b\x00\x07\x00\x00\x00\x08\x00\x00\x00\x0c\x00\x00\x00\x00\x00\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual '[Undefined encoding]'

  it 'should report correct text for ASCII GPSAreaInformation', ->
    @exif._dataView = getDataView '\x00\x1c\x00\x07\x00\x00\x00\x0b\x00\x00\x00\x0cASCII\x00\x00\x00ABC'
    expect(@exif._readTag('gps', 0).description).toEqual 'ABC'

  it 'should report correct character code for GPSAreaInformation', ->
    @exif._dataView = getDataView '\x00\x1c\x00\x07\x00\x00\x00\x08\x00\x00\x00\x0cJIS\x00\x00\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual '[JIS encoded text]'
    @exif._dataView = getDataView '\x00\x1c\x00\x07\x00\x00\x00\x08\x00\x00\x00\x0cUNICODE\x00'
    expect(@exif._readTag('gps', 0).description).toEqual '[Unicode encoded text]'
    @exif._dataView = getDataView '\x00\x1c\x00\x07\x00\x00\x00\x08\x00\x00\x00\x0c\x00\x00\x00\x00\x00\x00\x00\x00'
    expect(@exif._readTag('gps', 0).description).toEqual '[Undefined encoding]'

  # Parsing IPTC data

  it 'should recognize IPTC data', ->
    @exif._dataView = getDataView '\xff\xd8\xff\xed\x00\x10Photoshop 3.0\x00'
    @exif._checkImageHeader()
    expect(@exif._iptcDataOffset).toEqual 20

  it 'should read an IPTC resource block', ->
    @exif._dataView = getDataView '\xff\xd8\xff\xed\x00\x10Photoshop 3.0\x008BIM\x04\x04\x00\x00\x00\x00\x00\x42'
    @exif._checkImageHeader()
    block = @exif._getIptcResourceBlock()
    expect(block['type']).toEqual 0x0404
    expect(block['size']).toEqual 0x42

  it 'should fail for IPTC with faulty resource block', ->
    exif = @exif
    exif._dataView = getDataView '\xff\xd8\xff\xed\x00\x10Photoshop 3.0\x00XXXX'
    exif._checkImageHeader()
    expect(-> exif._getIptcResourceBlock()).toThrow(new Error 'Not an IPTC resource block.')

  it 'should find a single IPTC NAA resource block', ->
    @exif._dataView = getDataView '\xff\xd8\xff\xed\x00\x10Photoshop 3.0\x008BIM\x04\x04\x00\x00\x00\x00\x00\x42'
    @exif._checkImageHeader()
    block = @exif._getIptcNaaResourceBlock()
    expect(block['type']).toEqual 0x0404
    expect(block['size']).toEqual 0x42

  it 'should find the IPTC NAA resource block without previous padding', ->
    @exif._dataView = getDataView '\xff\xd8\xff\xed\x00\x10Photoshop 3.0\x008BIM\x04\x05\x00\x00\x00\x00\x00\x02\x00\x008BIM\x04\x04\x00\x00\x00\x00\x00\x42'
    @exif._checkImageHeader()
    block = @exif._getIptcNaaResourceBlock()
    expect(block['type']).toEqual 0x0404
    expect(block['size']).toEqual 0x42

  it 'should find the IPTC NAA resource block with previous padding', ->
    @exif._dataView = getDataView '\xff\xd8\xff\xed\x00\x10Photoshop 3.0\x008BIM\x04\x05\x00\x00\x00\x00\x00\x01\x00\x008BIM\x04\x04\x00\x00\x00\x00\x00\x42'
    @exif._checkImageHeader()
    block = @exif._getIptcNaaResourceBlock()
    expect(block['type']).toEqual 0x0404
    expect(block['size']).toEqual 0x42

  it 'should fail for IPTC header with no NAA resource block', ->
    exif = @exif
    exif._dataView = getDataView '\xff\xd8\xff\xed\x00\x10Photoshop 3.0\x008BIM\x04\x05\x00\x00\x00\x00\x00\x42'
    exif._checkImageHeader()
    expect(-> exif._getIptcNaaResourceBlock()).toThrow(new Error 'No IPTC NAA resource block.')

  it 'should read IPTC NAA resource tag', ->
    @exif._dataView = getDataView '\x1c\x47\x11\x00\x02BC'
    @exif._tagNames['iptc'][0x4711] = 'MyIptcTag'
    tag = @exif._readIptcTag()
    delete @exif._tagNames['iptc'][0x4711]
    expect(tag.name).toEqual 'MyIptcTag'
    expect(tag.value).toEqual [0x42, 0x43]
    expect(tag.description).toEqual 'BC'

  it 'should read IPTC NAA resource tag with dynamic description', ->
    @exif._dataView = getDataView '\x1c\x47\x11\x00\x01\x42'
    @exif._tagNames['iptc'][0x4711] = {
      'name': 'MyIptcTag',
      'description': (value) ->
        switch value[0]
          when 0x42 then 1
    }
    tag = @exif._readIptcTag()
    delete @exif._tagNames['iptc'][0x4711]
    expect(tag.name).toEqual 'MyIptcTag'
    expect(tag.value).toEqual [0x42]
    expect(tag.description).toEqual 1

  it 'should read undefined IPTC NAA resource tag', ->
    @exif._dataView = getDataView '\x1c\x47\x11\x00\x02\x42\x43'
    tag = @exif._readIptcTag()
    expect(tag.name).toEqual 'undefined-18193'
    expect(tag.value).toEqual [0x42, 0x43]
    expect(tag.description).toEqual [0x42, 0x43]

  it 'should read multiple IPTC NAA resource tags', ->
    @exif._iptcDataOffset = 0
    @exif._dataView = getDataView '\x1c\x47\x11\x00\x02BC' + '\x1c\x47\x12\x00\x02DE'
    @exif._tagNames['iptc'][0x4711] = 'MyIptcTag1'
    @exif._tagNames['iptc'][0x4712] = 'MyIptcTag2'
    tag1 = @exif._readIptcTag()
    tag2 = @exif._readIptcTag()
    delete @exif._tagNames['iptc'][0x4711]
    delete @exif._tagNames['iptc'][0x4712]
    expect(tag1.name).toEqual 'MyIptcTag1'
    expect(tag1.value).toEqual [0x42, 0x43]
    expect(tag1.description).toEqual 'BC'
    expect(tag2.name).toEqual 'MyIptcTag2'
    expect(tag2.value).toEqual [0x44, 0x45]
    expect(tag2.description).toEqual 'DE'

  it 'should read IPTC tags', ->
    @exif._dataView = getDataView '\xff\xd8\xff\xed\x00\x10Photoshop 3.0\x00' + '8BIM\x04\x04\x00\x00\x00\x00\x00\x0e' + '\x1c\x47\x11\x00\x02BC' + '\x1c\x47\x12\x00\x02DE'
    @exif._tagNames['iptc'][0x4711] = 'MyIptcTag1'
    @exif._tagNames['iptc'][0x4712] = 'MyIptcTag2'
    @exif._checkImageHeader()
    @exif._readIptcTags()
    delete @exif._tagNames['iptc'][0x4711]
    delete @exif._tagNames['iptc'][0x4712]
    expect(@exif.getTagDescription('MyIptcTag1')).toEqual 'BC'
    expect(@exif.getTagDescription('MyIptcTag2')).toEqual 'DE'

  it 'should report correct IPTC description for Coded Character Set', ->
    @exif._dataView = getDataView '\x1c\x01\x5a\x00\x03\x1b%G'
    expect(@exif._readIptcTag().description).toEqual 'UTF-8'
    @exif._iptcDataOffset = 0
    @exif._dataView = getDataView '\x1c\x01\x5a\x00\x04\x1b%/G'
    expect(@exif._readIptcTag().description).toEqual 'UTF-8 Level 1'
    @exif._iptcDataOffset = 0
    @exif._dataView = getDataView '\x1c\x01\x5a\x00\x04\x1b%/H'
    expect(@exif._readIptcTag().description).toEqual 'UTF-8 Level 2'
    @exif._iptcDataOffset = 0
    @exif._dataView = getDataView '\x1c\x01\x5a\x00\x04\x1b%/I'
    expect(@exif._readIptcTag().description).toEqual 'UTF-8 Level 3'

  it 'should report correct IPTC description for Record Version', ->
    testIptcSingle(@exif, 0, 'Record Version', '\x00\x04', '4')

  it 'should report correct IPTC description for Object Type Reference', ->
    testIptcSingle(@exif, 3, 'Object Type Reference', '01:News')

  it 'should report correct IPTC description for Object Attribute Reference', ->
    testIptcSingle(@exif, 4, 'Object Attribute Reference', '001:Current')

  it 'should report correct IPTC description for Object Name', ->
    testIptcSingle(@exif, 5, 'Object Name', 'MyObjectName')

  it 'should report correct IPTC description for Edit Status', ->
    testIptcSingle(@exif, 7, 'Edit Status', 'MyEditStatus')

  it 'should report correct IPTC description for Editorial Update', ->
    testIptcSingle(@exif, 8, 'Editorial Update', '01', 'Additional Language')

  it 'should report "Unknown" as IPTC description for unknown Editorial Update value', ->
    testIptcSingle(@exif, 8, 'Editorial Update', '02', 'Unknown')

  it 'should report correct IPTC description for Urgency', ->
    testIptcSingle(@exif, 10, 'Urgency', '7')

  it 'should report correct IPTC description for single Subject Reference', ->
    testIptcSingle(@exif, 12, 'Subject Reference', 'IPTC:04001001:Economy, Business & Finance:Agriculture:Arable Farming', 'Economy, Business & Finance/Agriculture/Arable Farming')

  it 'should report correct IPTC descriptions for repeated Subject Reference', ->
    testIptcRepeated(@exif, 12, 'Subject Reference',
      ['IPTC:04001001:Economy, Business & Finance:Agriculture:Arable Farming',
       'IPTC:04002005:Economy, Business & Finance:Chemicals:Organic chemicals'],
      ['Economy, Business & Finance/Agriculture/Arable Farming',
       'Economy, Business & Finance/Chemicals/Organic chemicals'])

  it 'should report correct IPTC description for Category', ->
    testIptcSingle(@exif, 15, 'Category');

  it 'should report correct IPTC description for repeated Supplemental Category', ->
    testIptcRepeated(@exif, 20, 'Supplemental Category')

  it 'should report correct IPTC description for Fixture Identifier', ->
    testIptcSingle(@exif, 22, 'Fixture Identifier', 'ABC');

  it 'should report correct IPTC description for repeated Keywords', ->
    testIptcRepeated(@exif, 25, 'Keywords')

  it 'should report correct IPTC description for repeated Content Location Code', ->
    testIptcRepeated(@exif, 26, 'Content Location Code')

  it 'should report correct IPTC description for repeated Content Location Name', ->
    testIptcRepeated(@exif, 27, 'Content Location Name')

  it 'should report correct IPTC description for Release Date', ->
    testIptcSingle(@exif, 30, 'Release Date', '19890317')

  it 'should report correct IPTC description for Release Time', ->
    testIptcSingle(@exif, 35, 'Release Time', '090102-0507')

  it 'should report correct IPTC description for Expiration Date', ->
    testIptcSingle(@exif, 37, 'Expiration Date', '19940317')

  it 'should report correct IPTC description for Expiration Time', ->
    testIptcSingle(@exif, 38, 'Expiration Time', '090102-0507')

  it 'should report correct IPTC description for Special Instructions', ->
    testIptcSingle(@exif, 40, 'Special Instructions')

  it 'should report correct IPTC description for Action Advised', ->
    testIptcSingle(@exif, 42, 'Action Advised', '01', 'Object Kill')
    testIptcSingle(@exif, 42, 'Action Advised', '02', 'Object Replace')
    testIptcSingle(@exif, 42, 'Action Advised', '03', 'Object Append')
    testIptcSingle(@exif, 42, 'Action Advised', '04', 'Object Reference')

  it 'should report correct IPTC description for repeated Reference Service', ->
    testIptcRepeated(@exif, 45, 'Reference Service')

  it 'should report correct IPTC description for repeated Reference Date', ->
    testIptcRepeated(@exif, 47, 'Reference Date', ['19890412', '19900513'])

  it 'should report correct IPTC description for repeated Reference Number', ->
    testIptcRepeated(@exif, 50, 'Reference Number', ['012345678', '12345678'])

  it 'should report correct IPTC description for Date Created', ->
    testIptcSingle(@exif, 55, 'Date Created', '19900127', '1990-01-27')

  it 'should report correct IPTC description for Time Created', ->
    testIptcSingle(@exif, 60, 'Time Created', '133015', '13:30:15')
    testIptcSingle(@exif, 60, 'Time Created', '133015+0100', '13:30:15+01:00')

  it 'should report correct IPTC description for Digital Creation Date', ->
    testIptcSingle(@exif, 62, 'Digital Creation Date', '19900127', '1990-01-27')

  it 'should report correct IPTC description for Digital Creation Time', ->
    testIptcSingle(@exif, 63, 'Digital Creation Time', '133015', '13:30:15')
    testIptcSingle(@exif, 63, 'Digital Creation Time', '133015+0100', '13:30:15+01:00')

  it 'should report correct IPTC description for Originating Program', ->
    testIptcSingle(@exif, 65, 'Originating Program')

  it 'should report correct IPTC description for Program Version', ->
    testIptcSingle(@exif, 70, 'Program Version')

  it 'should report correct IPTC description for Object Cycle', ->
    testIptcSingle(@exif, 75, 'Object Cycle', 'a', 'morning')
    testIptcSingle(@exif, 75, 'Object Cycle', 'p', 'evening')
    testIptcSingle(@exif, 75, 'Object Cycle', 'b', 'both')

  it 'should report correct IPTC description for By-line', ->
    testIptcRepeated(@exif, 80, 'By-line')

  it 'should report correct IPTC description for By-line Title', ->
    testIptcRepeated(@exif, 85, 'By-line Title')

  it 'should report correct IPTC description for City', ->
    testIptcSingle(@exif, 90, 'City')

  it 'should report correct IPTC description for Sub-location', ->
    testIptcSingle(@exif, 92, 'Sub-location')

  it 'should report correct IPTC description for Province/State', ->
    testIptcSingle(@exif, 95, 'Province/State')

  it 'should report correct IPTC description for Country/Primary Location Code', ->
    testIptcSingle(@exif, 100, 'Country/Primary Location Code')

  it 'should report correct IPTC description for Country/Primary Location Name', ->
    testIptcSingle(@exif, 101, 'Country/Primary Location Name')

  it 'should report correct IPTC description for Original Transmission Reference', ->
    testIptcSingle(@exif, 103, 'Original Transmission Reference')

  it 'should report correct IPTC description for Headline', ->
    testIptcSingle(@exif, 105, 'Headline')

  it 'should report correct IPTC description for Credit', ->
    testIptcSingle(@exif, 110, 'Credit')

  it 'should report correct IPTC description for Source', ->
    testIptcSingle(@exif, 115, 'Source')

  it 'should report correct IPTC description for Copyright Notice', ->
    testIptcSingle(@exif, 116, 'Copyright Notice')

  it 'should report correct IPTC description for Contact', ->
    testIptcRepeated(@exif, 118, 'Contact')

  it 'should report correct IPTC description for Caption/Abstract', ->
    testIptcSingle(@exif, 120, 'Caption/Abstract')

  it 'should report correct IPTC description for Writer/Editor', ->
    testIptcRepeated(@exif, 122, 'Writer/Editor')

  it 'should report correct IPTC description for Rasterized Caption', ->
    # This is always 7360 octets. Best to test it correctly.
    value =
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
    description = value.split('').map((character) -> character.charCodeAt(0))
    testIptcSingle(@exif, 125, 'Rasterized Caption', value, description)

  it 'should report correct IPTC description for Image Type', ->
    testIptcSingle(@exif, 130, 'Image Type', '0T')

  it 'should report correct IPTC description for Image Orientation', ->
    testIptcSingle(@exif, 131, 'Image Orientation', 'P', 'Portrait')
    testIptcSingle(@exif, 131, 'Image Orientation', 'L', 'Landscape')
    testIptcSingle(@exif, 131, 'Image Orientation', 'S', 'Square')

  it 'should report correct IPTC description for Language Identifier', ->
    testIptcSingle(@exif, 135, 'Language Identifier', 'eo')

  it 'should report correct IPTC description for Audio Type', ->
    testIptcSingle(@exif, 150, 'Audio Type', '0T')
    testIptcSingle(@exif, 150, 'Audio Type', '1A', 'Mono, actuality')
    testIptcSingle(@exif, 150, 'Audio Type', '2A', 'Stereo, actuality')
    testIptcSingle(@exif, 150, 'Audio Type', '1C', 'Mono, question and answer session')
    testIptcSingle(@exif, 150, 'Audio Type', '1M', 'Mono, music, transmitted by itself')
    testIptcSingle(@exif, 150, 'Audio Type', '1Q', 'Mono, response to a question')
    testIptcSingle(@exif, 150, 'Audio Type', '1R', 'Mono, raw sound')
    testIptcSingle(@exif, 150, 'Audio Type', '1S', 'Mono, scener')
    testIptcSingle(@exif, 150, 'Audio Type', '1V', 'Mono, voicer')
    testIptcSingle(@exif, 150, 'Audio Type', '1W', 'Mono, wrap')

  it 'should report correct IPTC description for Audio Sampling Rate', ->
    testIptcSingle(@exif, 151, 'Audio Sampling Rate', '000000', '0 Hz')
    testIptcSingle(@exif, 151, 'Audio Sampling Rate', '000001', '1 Hz')
    testIptcSingle(@exif, 151, 'Audio Sampling Rate', '044100', '44100 Hz')
    testIptcSingle(@exif, 151, 'Audio Sampling Rate', '176400', '176400 Hz')

  it 'should report correct IPTC description for Audio Sampling Resolution', ->
    testIptcSingle(@exif, 152, 'Audio Sampling Resolution', '00', '0 bits')
    testIptcSingle(@exif, 152, 'Audio Sampling Resolution', '01', '1 bit')
    testIptcSingle(@exif, 152, 'Audio Sampling Resolution', '02', '2 bits')
    testIptcSingle(@exif, 152, 'Audio Sampling Resolution', '16', '16 bits')

  it 'should report correct IPTC description for Audio Duration', ->
    testIptcSingle(@exif, 153, 'Audio Duration', '120105', '12:01:05')

  it 'should report correct IPTC description for Audio Outcue', ->
    testIptcSingle(@exif, 154, 'Audio Outcue', '... better as a team')

  it 'should report correct IPTC description for ObjectData Preview File Format', ->
    fileFormats = {
      '00': 'No ObjectData',
      '01': 'IPTC-NAA Digital Newsphoto Parameter Record',
      '02': 'IPTC7901 Recommended Message Format',
      '03': 'Tagged Image File Format (Adobe/Aldus Image data)',
      '04': 'Illustrator (Adobe Graphics data)',
      '05': 'AppleSingle (Apple Computer Inc)',
      '06': 'NAA 89-3 (ANPA 1312)',
      '07': 'MacBinary II',
      '08': 'IPTC Unstructured Character Oriented File Format (UCOFF)',
      '09': 'United Press International ANPA 1312 variant',
      '10': 'United Press International Down-Load Message',
      '11': 'JPEG File Interchange (JFIF)',
      '12': 'Photo-CD Image-Pac (Eastman Kodak)',
      '13': 'Microsoft Bit Mapped Graphics File [*.BMP]',
      '14': 'Digital Audio File [*.WAV] (Microsoft & Creative Labs)',
      '15': 'Audio plus Moving Video [*.AVI] (Microsoft)',
      '16': 'PC DOS/Windows Executable Files [*.COM][*.EXE]',
      '17': 'Compressed Binary File [*.ZIP] (PKWare Inc)',
      '18': 'Audio Interchange File Format AIFF (Apple Computer Inc)',
      '19': 'RIFF Wave (Microsoft Corporation)',
      '20': 'Freehand (Macromedia/Aldus)',
      '21': 'Hypertext Markup Language "HTML" (The Internet Society)',
      '22': 'MPEG 2 Audio Layer 2 (Musicom), ISO/IEC',
      '23': 'MPEG 2 Audio Layer 3, ISO/IEC',
      '24': 'Portable Document File (*.PDF) Adobe',
      '25': 'News Industry Text Format (NITF)',
      '26': 'Tape Archive (*.TAR)',
      '27': 'Tidningarnas Telegrambyrå NITF version (TTNITF DTD)',
      '28': 'Ritzaus Bureau NITF version (RBNITF DTD)',
      '29': 'Corel Draw [*.CDR]'
      '99': 'Unknown format 99'
    }
    for id, format of fileFormats
      testIptcSingle(@exif, 200, 'ObjectData Preview File Format', id, format)

  it 'should report correct IPTC description for ObjectData Preview File Format Version', ->
    formatVersions = [
      ['00', '00', '1'],
      ['01', '01', '1'],
      ['01', '02', '2'],
      ['01', '03', '3'],
      ['01', '04', '4'],
      ['02', '04', '4'],
      ['03', '01', '5.0'],
      ['03', '02', '6.0'],
      ['04', '01', '1.40'],
      ['05', '01', '2'],
      ['06', '01', '1'],
      ['11', '01', '1.02'],
      ['20', '01', '3.1'],
      ['20', '02', '4.0'],
      ['20', '03', '5.0'],
      ['20', '04', '5.5'],
      ['21', '02', '2.0']
    ]
    for version in formatVersions
      testIptcFileFormatVersion(@exif, version[0], version[1], version[2])

  it 'should report correct IPTC description for unknown ObjectData Preview File Format Version', ->
    testIptcSingle(@exif, 201, 'ObjectData Preview File Format Version', '47')

  it 'should report correct IPTC description for ', ->
    testIptcSingle(@exif, 202, 'ObjectData Preview Data', 'ABC')
