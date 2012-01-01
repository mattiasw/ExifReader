###
# ExifReader 0.1
# http://github.com/mattiasw/exifreader
# Copyright (C) 2011  Mattias Wallander <mattias@wallander.eu>
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

  beforeEach ->
    @exif = new ExifReader
    @exif._littleEndian = false

  it 'should accept well-formed header of JPEG image data', ->
    @exif._dataView = getDataView '\xff\xd8\xff\xe100Exif\x00\x00'
    @exif._checkImageHeader()

  it 'should fail for faulty header of JPEG image data', ->
    @exif._dataView = getDataView '\x00'
    try
      @exif._checkImageHeader()
    catch error
      expect(error).toEqual('Invalid image format or no Exif data')

  it 'should set correct byte order for litte endian data', ->
    @exif._dataView = getDataView '\x49\x49'
    @exif._tiffHeaderOffset = 0
    @exif._setByteOrder()
    expect(@exif._littleEndian).toBeTruthy()

  it 'should set correct byte order for big endian data', ->
    @exif._dataView = getDataView '\x4d\x4d'
    @exif._tiffHeaderOffset = 0
    @exif._setByteOrder()
    expect(@exif._littleEndian).toBeFalsy()

  it 'should not allow illegal byte order value', ->
    @exif._dataView = getDataView '\x00\x00'
    @exif._tiffHeaderOffset = 0
    try
      @exif._setByteOrder()
    catch error
      expect(error).toEqual('Illegal byte order value. Faulty image.')

  it 'should correctly read offset of 0th IFD for little endian data', ->
    @exif._dataView = getDataView '\x49\x49\x00\x2a\x08\x00\x00\x00'
    @exif._tiffHeaderOffset = 0
    @exif._setByteOrder()
    expect(@exif._getIfdOffset(0)).toEqual(8)

  it 'should correctly read offset of 0th IFD for big endian data', ->
    @exif._dataView = getDataView '\x4d\x4d\x00\x2a\x00\x00\x00\x08'
    @exif._tiffHeaderOffset = 0
    @exif._setByteOrder()
    expect(@exif._getIfdOffset(0)).toEqual(8)

  it 'should be able to read a byte', ->
    @exif._dataView = getDataView '\x42'
    expect(@exif._getByteAt(0)).toEqual(0x42)

  it 'should be able to read an ASCII text', ->
    @exif._dataView = getDataView 'String\x00'
    expect(@exif._getAsciiAt(0)).toEqual('S'.charCodeAt(0))

  it 'should be able to read a little endian short', ->
    @exif._dataView = getDataView '\x11\x47'
    @exif._littleEndian = true
    expect(@exif._getShortAt(0)).toEqual(0x4711)

  it 'should be able to read a big endian short', ->
    @exif._dataView = getDataView '\x47\x11'
    @exif._littleEndian = false
    expect(@exif._getShortAt(0)).toEqual(0x4711)

  it 'should be able to read a little endian long', ->
    @exif._dataView = getDataView '\x45\x44\x43\x42'
    @exif._littleEndian = true
    expect(@exif._getLongAt(0)).toEqual(0x42434445)

  it 'should be able to read a big endian long', ->
    @exif._dataView = getDataView '\x42\x43\x44\x45'
    @exif._littleEndian = false
    expect(@exif._getLongAt(0)).toEqual(0x42434445)

  it 'should be able to read a little endian rational', ->
    @exif._dataView = getDataView '\x45\x44\x43\x42\x49\x48\x47\x46'
    @exif._littleEndian = true
    expect(@exif._getRationalAt(0)).toEqual(0x42434445/0x46474849)

  it 'should be able to read a big endian rational', ->
    @exif._dataView = getDataView '\x42\x43\x44\x45\x46\x47\x48\x49'
    @exif._littleEndian = false
    expect(@exif._getRationalAt(0)).toEqual(0x42434445/0x46474849)

  it 'should be able to read an undefined', ->
    @exif._dataView = getDataView '\x42'
    expect(@exif._getUndefinedAt(0)).toEqual(0x42)

  it 'should be able to read a little endian slong', ->
    @exif._dataView = getDataView '\xbe\xff\xff\xff'
    @exif._littleEndian = true
    expect(@exif._getSlongAt(0)).toEqual(-0x42)

  it 'should be able to read a big endian slong', ->
    @exif._dataView = getDataView '\xff\xff\xff\xbe'
    @exif._littleEndian = false
    expect(@exif._getSlongAt(0)).toEqual(-0x42)

  it 'should be able to read a little endian srational', ->
    @exif._dataView = getDataView '\xbe\xff\xff\xff\x49\x48\x47\x46'
    @exif._littleEndian = true
    expect(@exif._getSrationalAt(0)).toEqual(-0x42/0x46474849)

  it 'should be able to read a big endian srational', ->
    @exif._dataView = getDataView '\xff\xff\xff\xbe\x46\x47\x48\x49'
    @exif._littleEndian = false
    expect(@exif._getSrationalAt(0)).toEqual(-0x42/0x46474849)

  it 'should be able to get ASCII value', ->
    expect(@exif._getAsciiValue(['S'.charCodeAt(0), 't'.charCodeAt(0), 'r'.charCodeAt(0), 'i'.charCodeAt(0), 'n'.charCodeAt(0), 'g'.charCodeAt(0), 0x00])).toEqual('String')

  it 'should be able to get IFD offset', ->
    @exif._dataView = getDataView '\x00\x00\x00\x00\x00\x2a\x47\x11\x48\x12'
    @exif._tiffHeaderOffset = 2
    expect(@exif._getIfdOffset()).toEqual(@exif._tiffHeaderOffset + 0x47114812)

  it 'should be able to read a one-field IFD', ->
    # field count + field
    @exif._dataView = getDataView '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00'
    @exif._tags = {}
    @exif._tagNames['0th'][0x4711] = 'MyExifTag'
    @exif._readIfd '0th', 0
    expect(@exif.getTagDescription('MyExifTag')).toEqual(0x42)

  it 'should be able to read a multi-field IFD', ->
    # field count + 1st field + 2nd field
    @exif._dataView = getDataView('\x00\x02' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x47\x12\x00\x01\x00\x00\x00\x01\x43\x00\x00\x00')
    @exif._tags = {}
    @exif._tagNames['0th'][0x4711] = 'MyExifTag0'
    @exif._tagNames['0th'][0x4712] = 'MyExifTag1'
    @exif._readIfd '0th', 0
    expect(@exif.getTagDescription('MyExifTag0')).toEqual(0x42)
    expect(@exif.getTagDescription('MyExifTag1')).toEqual(0x43)

  it 'should throw "Undefined" for undefined tag names', ->
    @exif._tags = {}
    try
      @exif.getTagDescription('MyUndefinedTagName')
    catch error
      expect(error).toEqual('Undefined')
