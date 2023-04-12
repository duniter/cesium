//! numeral.js locale configuration
//! locale : catalan (ca)
//! author : arbocenc: https://personal.calbasi.net

(function (global, factory) {
   typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('../numeral')) :
   typeof define === 'function' && define.amd ? define(['numeral'], factory) :
   factory(global.numeral)
}(this, function (numeral) { 'use strict';

  numeral.language('ca', {
    "delimiters": {
      "thousands": ".",
      "decimal": ","
    },
    "abbreviations": {
      "thousand": "x10^3",
      "million":  "x10^6",
      "billion":  "x10^12",
      "trillion": "x10^18"
    },
    "ordinal": function (number) {
      return (number === 1) ? 'a' : 'a';
    },
    "currency": {
      "symbol": "€"
    }
  });
}));
