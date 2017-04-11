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
      "thousand": "<small>x10<sup>3</sup></small>",
      "million":  "<small>x10<sup>6</sup></small>",
      "billion":  "<small>x10<sup>9</sup></small>",
      "trillion": "<small>x10<sup>12</sup></small>"
    },
    "ordinal": function (number) {
      return (number === 1) ? 'er' : 'ième';
    },
    "currency": {
      "symbol": "X"
    }
  });
}));
