//! moment.js locale configuration
//! locale : french (fr)
//! author : John Fischer : https://github.com/jfroffice

(function (global, factory) {
   typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('../numeral')) :
   typeof define === 'function' && define.amd ? define(['numeral'], factory) :
   factory(global.numeral)
}(this, function (numeral) { 'use strict';

    numeral.language('fr', {
      "delimiters": {
        "thousands": " ",
        "decimal": "."
      },
      "abbreviations": {
        "thousand": "k",
        "million": "M",
        "billion": "Md",
        "trillion": "T"
      },
      "ordinal": function (number) {
        return (number === 1) ? 'er' : 'ième';
      },
      "currency": {
        "symbol": "€"
      }
    });
}));
