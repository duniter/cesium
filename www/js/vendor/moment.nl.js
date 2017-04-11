//! moment.js locale configuration
//! locale : dutch (nl)
//! author : RA van Hagen : https://github.com/RavanH

(function (global, factory) {
   typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('../moment')) :
   typeof define === 'function' && define.amd ? define(['moment'], factory) :
   factory(global.moment)
}(this, function (moment) { 'use strict';

    var nl = moment.defineLocale('nl', {
        months : 'januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december'.split('|'),
        monthsShort : 'jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec'.split('|'),
        weekdays : 'zondag|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag'.split('|'),
        weekdaysShort : 'zo.|ma.|di.|wo.|do.|vr.|za.'.split('|'),
        weekdaysMin : 'zo|ma|di|wo|do|vr|za'.split('|'),
        longDateFormat : {
            LT : 'HH:mm',
            LTS : 'HH:mm:ss',
            L : 'DD/MM/YYYY',
            LL : 'D MMMM YYYY',
            LLL : 'D MMMM YYYY HH:mm',
            LLLL : 'dddd D MMMM YYYY HH:mm'
        },
        calendar : {
            sameDay: '[Vandaag om] LT',
            nextDay: '[Morgen om] LT',
            nextWeek: 'dddd [om] LT',
            lastDay: '[Gisteren om] LT',
            lastWeek: '[afgelopen] dddd [om] LT',
            sameElse: 'L'
        },
        relativeTime : {
            future : 'over %s',
            past : '%s geleden',
            s : 'enkele seconden',
            m : 'een minuut',
            mm : '%d minuten',
            h : 'een uur',
            hh : '%d uren',
            d : 'een dag',
            dd : '%d dagen',
            M : 'een maand',
            MM : '%d maanden',
            y : 'een jaar',
            yy : '%d jaar'
        },
        ordinalParse: /\d{1,2}(er|)/,
        ordinal : function (number) {
            return number + '<sup>e</sup>';
        },
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });

    return nl;
}));
