//! moment.js locale configuration
//! locale : french (es)
//! author : Fiatou: https://github.com/fiatou

(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('../moment')) :
    typeof define === 'function' && define.amd ? define(['moment'], factory) :
      factory(global.moment)
}(this, function (moment) { 'use strict';


  var es = moment.defineLocale('es', {
    months : 'enero_febrero_marzo_abril_mayo_junio_julio_agosto_septiembre_octubre_noviembre_diciembre'.split('_'),
    monthsShort : 'ener._febr._mar._abr._may._jun._jul._agos_sept._oct._nov._dic.'.split('_'),
    weekdays : 'domingo_lunes_martes_miércoles_jueves_viernes_sábado'.split('_'),
    weekdaysShort : 'dom._lun._mar._mie._jue._vie._sáb.'.split('_'),
    weekdaysMin : 'Do_Lu_Ma_Mi_Ju_Vi_Sá'.split('_'),
    longDateFormat : {
      LT : 'HH:mm',
      LTS : 'HH:mm:ss',
      L : 'DD/MM/YYYY',
      LL : 'D MMMM YYYY',
      LLL : 'D MMMM YYYY HH:mm',
      LLLL : 'dddd D MMMM YYYY HH:mm'
    },
    calendar : {
      sameDay: '[Hoy a] LT',
      nextDay: '[Mañana a] LT',
      nextWeek: 'dddd [a] LT',
      lastDay: '[Ayer a] LT',
      lastWeek: 'dddd [último a] LT',
      sameElse: 'L'
    },
    relativeTime : {
      future : 'en %s',
      past : 'hace %s',
      s : 'algunas segundas',
      m : 'un minuto',
      mm : '%d minutos',
      h : 'una hora',
      hh : '%d horas',
      d : 'un dia',
      dd : '%d dias',
      M : 'un mes',
      MM : '%d meses',
      y : 'un año',
      yy : '%d años'
    },
    ordinalParse: /\d{1,2}(er|)/,
    ordinal : function (number) {
      return number + (number === 1 ? 'ero' : '');
    },
    week : {
      dow : 1, // Monday is the first day of the week.
      doy : 4  // The week that contains Jan 4th is the first week of the year.
    }
  });

  return es;

}));
