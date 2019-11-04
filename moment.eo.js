//! moment.js locale configuration
//! locale : esperanto (fr)
//! author : Vivakvo: https://github.com/vivakvo

(function (global, factory) {
   typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('../moment')) :
   typeof define === 'function' && define.amd ? define(['moment'], factory) :
   factory(global.moment)
}(this, function (moment) { 'use strict';


    var eo = moment.defineLocale('eo', {
        months : 'januaro_februaro_marto_aprilo_majo_junio_julio_aŭgusto_septembro_oktobro_novembro_decembro'.split('_'),
        monthsShort : 'jan._feb._mart._apr._majo_jun._jul._aŭg._sept._okt._nov._dec.'.split('_'),
        weekdays : 'dimanĉo_lundo_mardo_merkredo_jaŭdo_vendredo_sabato'.split('_'),
        weekdaysShort : 'dim._lun._mar._mer._jaŭ._ven._sab.'.split('_'),
        weekdaysMin : 'Di_Lu_Ma_Me_Ja_Ve_Sa'.split('_'),
        longDateFormat : {
            LT : 'HH:mm',
            LTS : 'HH:mm:ss',
            L : 'DD/MM/YYYY',
            LL : 'D MMMM YYYY',
            LLL : 'D MMMM YYYY HH:mm',
            LLLL : 'dddd D MMMM YYYY HH:mm'
        },
        calendar : {
            sameDay: '[Hodiaŭ je] LT',
            nextDay: '[Morgaŭ je] LT',
            nextWeek: 'dddd [je] LT',
            lastDay: '[Hieraŭ je] LT',
            lastWeek: '[Pasintan] dddd[n je] LT',
            sameElse: 'L'
        },
        relativeTime : {
            future : 'post %s',
            past : 'antaŭ %s',
            s : 'kelkaj sekundoj',
            m : 'unu minuto',
            mm : '%d minutoj',
            h : 'unu horo',
            hh : '%d horoj',
            d : 'unu tago',
            dd : '%d tagoj',
            M : 'unu monato',
            MM : '%d monatoj',
            y : 'unu jaro',
            yy : '%d jaroj'
        },
        ordinalParse: /\d{1,2}(er|)/,
        ordinal : function (number) {
            return number + 'a';
        },
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });

    return eo;

}));