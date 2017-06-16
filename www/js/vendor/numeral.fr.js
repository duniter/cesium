//! numeral.js locale configuration
//! locale : french (fr)
//! author : blavenie: https://github.com/blavenie

(function (global, factory) {
   typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('../numeral')) :
   typeof define === 'function' && define.amd ? define(['numeral'], factory) :
   factory(global.numeral)
}(this, function (numeral) { 'use strict';

  numeral.language('fr', {
    "delimiters": {
      "thousands": " ",
      "decimal": ","
    },
    "abbreviations": {
      "thousand": "x10^3",
      "million":  "x10^6",
      "billion":  "x10^9",
      "trillion": "x10^12"
    },
    "ordinal": function (number) {
      return (number === 1) ? 'er' : 'ième';
    },
    "currency": {
      "symbol": "X"
    }
  });
}));
