//! numeral.js locale configuration
//! locale : spanish (es)
//! author : Fiatou: https://github.com/fiatou

(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('../numeral')) :
    typeof define === 'function' && define.amd ? define(['numeral'], factory) :
      factory(global.numeral)
}(this, function (numeral) { 'use strict';

  numeral.language('es', {
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
      switch(number) {
        case 1:
          return 'ero';
        case 2:
          return 'do';
        case 3:
          return 'ro';
        case 4:
        case 5:
        case 6:
        case 7:
          return 'to';
        case 8:
          return 'vo';
        case 9:
          return 'no';
        default:
          return 'mo';
      }
    },
    "currency": {
      "symbol": "X"
    }
  });
}));
