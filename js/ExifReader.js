(function() {
  /*
  # ExifReader 0.1
  # http://github.com/mattiasw/exifreader
  # Copyright (C) 2011  Mattias Wallander <mattias@wallander.eu>
  # Licensed under the GNU Lesser General Public License version 3 or later
  # See license text at http://www.gnu.org/licenses/lgpl.txt
  */  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };
  (typeof exports !== "undefined" && exports !== null ? exports : this).ExifReader = (function() {
    ExifReader.prototype._tiffHeaderOffset = 0x0c;
    function ExifReader() {
      this._getTagValueAt = {
        1: __bind(function(offset) {
          return this._getByteAt(offset);
        }, this),
        2: __bind(function(offset) {
          return this._getAsciiAt(offset);
        }, this),
        3: __bind(function(offset) {
          return this._getShortAt(offset);
        }, this),
        4: __bind(function(offset) {
          return this._getLongAt(offset);
        }, this),
        5: __bind(function(offset) {
          return this._getRationalAt(offset);
        }, this),
        7: __bind(function(offset) {
          return this._getUndefinedAt(offset);
        }, this),
        9: __bind(function(offset) {
          return this._getSlongAt(offset);
        }, this),
        10: __bind(function(offset) {
          return this._getSrationalAt(offset);
        }, this)
      };
    }
    /*
      # Loads all the Exif tags from the specified image file buffer.
      #
      # @_data ArrayBuffer Image file data
      */
    ExifReader.prototype.load = function(data) {
      return this.loadView(new DataView(data));
    };
    /*
      # Loads all the Exif tags from the specified image file buffer view. Probably
      # used when DataView isn't supported by the browser.
      #
      # @_dataView DataView Image file data view
      */
    ExifReader.prototype.loadView = function(_dataView) {
      this._dataView = _dataView;
      this._tags = {};
      this._checkImageHeader();
      return this._readTags();
    };
    ExifReader.prototype._checkImageHeader = function() {
      if (this._dataView.byteLength < 12 || this._dataView.getUint32(0, false) !== 0xffd8ffe1 || this._dataView.getUint32(6, false) !== 0x45786966 || this._dataView.getUint16(10, false) !== 0x0000) {
        throw 'Invalid image format or no Exif data';
      }
    };
    ExifReader.prototype._readTags = function() {
      this._setByteOrder();
      this._read0thIfd();
      this._readExifIfd();
      this._readGpsIfd();
      return this._readInteroperabilityIfd();
    };
    ExifReader.prototype._setByteOrder = function() {
      if (this._dataView.getUint16(this._tiffHeaderOffset) === 0x4949) {
        return this._littleEndian = true;
      } else if (this._dataView.getUint16(this._tiffHeaderOffset) === 0x4d4d) {
        return this._littleEndian = false;
      } else {
        throw 'Illegal byte order value. Faulty image.';
      }
    };
    ExifReader.prototype._read0thIfd = function() {
      var ifdOffset;
      ifdOffset = this._getIfdOffset();
      return this._readIfd('0th', ifdOffset);
    };
    ExifReader.prototype._getIfdOffset = function() {
      return this._tiffHeaderOffset + this._getLongAt(this._tiffHeaderOffset + 4);
    };
    ExifReader.prototype._readExifIfd = function() {
      var ifdOffset;
      if (this._tags['Exif IFD Pointer'] != null) {
        ifdOffset = this._tiffHeaderOffset + this._tags['Exif IFD Pointer'];
        return this._readIfd('exif', ifdOffset);
      }
    };
    ExifReader.prototype._readGpsIfd = function() {
      var ifdOffset;
      if (this._tags['GPS Info IFD Pointer'] != null) {
        ifdOffset = this._tiffHeaderOffset + this._tags['GPS Info IFD Pointer'];
        return this._readIfd('gps', ifdOffset);
      }
    };
    ExifReader.prototype._readInteroperabilityIfd = function() {
      var ifdOffset;
      if (this._tags['Interoperability IFD Pointer'] != null) {
        ifdOffset = this._tiffHeaderOffset + this._tags['Interoperability IFD Pointer'];
        return this._readIfd('interoperability', ifdOffset);
      }
    };
    ExifReader.prototype._readIfd = function(ifdType, offset) {
      var fieldIndex, numberOfFields, tag, _results;
      numberOfFields = this._getShortAt(offset);
      offset += 2;
      _results = [];
      for (fieldIndex = 0; 0 <= numberOfFields ? fieldIndex < numberOfFields : fieldIndex > numberOfFields; 0 <= numberOfFields ? fieldIndex++ : fieldIndex--) {
        tag = this._readTag(ifdType, offset);
        this._tags[tag.name] = tag.value;
        _results.push(offset += 12);
      }
      return _results;
    };
    ExifReader.prototype._readTag = function(ifdType, offset) {
      var tagCode, tagCount, tagType, tagValue, tagValueOffset;
      tagCode = this._getShortAt(offset);
      tagType = this._getShortAt(offset + 2);
      tagCount = this._getLongAt(offset + 4);
      if (this._typeSizes[tagType] * tagCount <= 4) {
        tagValue = this._getTagValue(offset + 8, tagType, tagCount);
      } else {
        tagValueOffset = this._getLongAt(offset + 8);
        tagValue = this._getTagValue(this._tiffHeaderOffset + tagValueOffset, tagType, tagCount);
      }
      if (this._tagNames[ifdType][tagCode] != null) {
        return {
          'name': this._tagNames[ifdType][tagCode],
          'value': tagValue
        };
      } else {
        return {
          'name': "undefined-" + tagCode,
          'value': tagValue
        };
      }
    };
    ExifReader.prototype._getTagValue = function(offset, type, count) {
      var tagValue, value, valueIndex;
      value = (function() {
        var _results;
        _results = [];
        for (valueIndex = 0; 0 <= count ? valueIndex < count : valueIndex > count; 0 <= count ? valueIndex++ : valueIndex--) {
          tagValue = this._getTagValueAt[type](offset);
          offset += this._typeSizes[type];
          _results.push(tagValue);
        }
        return _results;
      }).call(this);
      if (value.length === 1) {
        value = value[0];
      } else if (type === this._tagTypes['ASCII']) {
        value = this._getAsciiValue(value);
      }
      return value;
    };
    ExifReader.prototype._getAsciiValue = function(charArray) {
      var char, newCharArray;
      newCharArray = (function() {
        var _i, _len, _results;
        _results = [];
        for (_i = 0, _len = charArray.length; _i < _len; _i++) {
          char = charArray[_i];
          if (char === 0x00) {
            break;
          }
          _results.push(String.fromCharCode(char));
        }
        return _results;
      })();
      return newCharArray.join('');
    };
    ExifReader.prototype._getByteAt = function(offset) {
      return this._dataView.getUint8(offset);
    };
    ExifReader.prototype._getAsciiAt = function(offset) {
      return this._dataView.getUint8(offset);
    };
    ExifReader.prototype._getShortAt = function(offset) {
      return this._dataView.getUint16(offset, this._littleEndian);
    };
    ExifReader.prototype._getLongAt = function(offset) {
      return this._dataView.getUint32(offset, this._littleEndian);
    };
    ExifReader.prototype._getRationalAt = function(offset) {
      return this._getLongAt(offset) / this._getLongAt(offset + 4);
    };
    ExifReader.prototype._getUndefinedAt = function(offset) {
      return this._getByteAt(offset);
    };
    ExifReader.prototype._getSlongAt = function(offset) {
      return this._dataView.getInt32(offset, this._littleEndian);
    };
    ExifReader.prototype._getSrationalAt = function(offset) {
      return this._getSlongAt(offset) / this._getSlongAt(offset + 4);
    };
    ExifReader.prototype._typeSizes = {
      1: 1,
      2: 1,
      3: 2,
      4: 4,
      5: 8,
      7: 1,
      9: 4,
      10: 8
    };
    ExifReader.prototype._tagTypes = {
      'BYTE': 1,
      'ASCII': 2,
      'SHORT': 3,
      'LONG': 4,
      'RATIONAL': 5,
      'UNDEFINED': 7,
      'SLONG': 9,
      'SRATIONAL': 10
    };
    ExifReader.prototype._tagNames = {
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
        0x0001: 'InteroperabilityIndex',
        0x0002: 'UnknownInteroperabilityTag0x0002',
        0x1001: 'UnknownInteroperabilityTag0x1001',
        0x1002: 'UnknownInteroperabilityTag0x1002'
      }
    };
    /*
      # Gets the image's value of the tag with the given name.
      #
      # name string The name of the tag to get the value of
      #
      # Returns the description of the tag with the given name if it exists,
      # otherwise throws "Undefined".
      */
    ExifReader.prototype.getTagDescription = function(name) {
      if (this._tags[name] != null) {
        return this._tags[name];
      } else {
        throw 'Undefined';
      }
    };
    /*
      # Gets all the image's tags.
      #
      # Returns the image's tags as an associative array: name -> description.
      */
    ExifReader.prototype.getAllTags = function() {
      return this._tags;
    };
    return ExifReader;
  })();
}).call(this);
