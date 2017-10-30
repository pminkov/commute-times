function App() {
  this.map = new google.maps.Map(document.getElementById('map'), {
    zoom: 11,
    center: { lat: 37.779236, lng: -122.449621 },
    mapTypeControl: false
  });

  this.directionsDisplay = new google.maps.DirectionsRenderer;
  this.directionsDisplay.setMap(this.map);

  this.directionsService = new google.maps.DirectionsService;
  this.geocoder = new google.maps.Geocoder;

  var control = document.getElementById('floating-panel');
  control.style.display = 'block';
  this.map.controls[google.maps.ControlPosition.TOP_CENTER].push(control);

  initTimeTable();

  var queryTravelTimes = function() {
    showDrivingTimes(this.geocoder, this.directionsService, this.directionsDisplay);
  }.bind(this);

  var handleEnter = function(e) {
    if (e.keyCode == 13) {
      queryTravelTimes();
    }
  }
  $('input').keyup(handleEnter);
  $('#go').click(queryTravelTimes);
}

function startApp() {
  var app = new App();
}

function showNoRoute() {
  $('#noroute').show();
}

function hideNoRoute() {
  $('#noroute').hide();
}


function initTimeTable() {
  for (var t = 4; t < 24; t++) {
    var tt;
    if (t == 0) tt = '12am';
    else if (t == 12) tt = '12pm';
    else if (t <= 11) tt = t + 'am';
    else tt = t - 12 + 'pm';

    $('#times').append(
      '<tr id="time-' + t + '">' + 
        '<td class="used_time">' + tt + '</td>' +
        '<td class="time_slot slot_ab"></td>' + 
        '<td class="time_slot slot_ba"></td>' + 
      '</tr>');
  }
}

function ThrottledBatch()  {
  var per_second = 4;
  this.wait_time = 1.0 / per_second * 1000.0;
  this.batch = [];
}

ThrottledBatch.prototype.addRequest = function(func) {
  this.batch.push(func);
}

ThrottledBatch.prototype.executeOne = function(index) {
  var me = this;

  if (index == me.batch.length) {
    return;
  } else {
    
    this.batch[index](function(status) {
      console.log(index, ' -> ', status);
      var timeout;
      if (status == 'OK') {
        setTimeout(function() {
          me.executeOne(index + 1);
        }, me.wait_time);
      } else if (status == 'OVER_QUERY_LIMIT') {
        console.log('Oops, waiting..');
        setTimeout(function() {
          me.executeOne(index);
        }, 1000);
      } else {
        showNoRoute();
      }
    });
  }
}

ThrottledBatch.prototype.execute = function() {
  console.log('Executing', this.batch.length, 'requests');

  this.executeOne(0);
}

function lookupTimeZone(geocoder, location_name, callback) {
  console.log('Looking up');
  geocoder.geocode( { address: location_name }, function(results, status) {
    if (status == 'OK') {
      var position = results[0].geometry.location;

      // Lookup timezone.
      var params = {
        location: position.lat() + "," + position.lng(),
        key: "AIzaSyCyqbUW-VapBGgdWQWXYon8QAyA_X7Mkr4",
        timestamp: new Date().getTime() / 1000.0
      }

      var url= "https://maps.googleapis.com/maps/api/timezone/json?" + $.param(params);
      console.log(url);
      $.ajax(url).done(function(data) {
        callback(data);
      });
    } else {
      showNoRoute();
    }
  });
}

function showDrivingTimes(geocoder, directionsService, directionsDisplay) {
  hideNoRoute();
  var start = $('#address-from').val();
  var end = $('#address-to').val();

  var printed_tz_debug = false;

  lookupTimeZone(geocoder, start, function(tz_data) {
    console.log(tz_data);
    var tz_offset_hours = (tz_data.dstOffset + tz_data.rawOffset) / 3600.0;

    var batch = new ThrottledBatch();

    var modes = ['ab', 'ba'];
    var route_displayed = false;

    hour_lim = 24;

    for (var hour = 0; hour < hour_lim; hour++) {
      $('#time-' + hour + ' .slot_ab').text('');
      $('#time-' + hour + ' .slot_ba').text('');
    }

    for (var mode_i = 0; mode_i < modes.length; mode_i++) {
      mode = modes[mode_i];

      var hour_from;
      var hour_to;
      if (mode == 'ab') {
        hour_from = 6;
        hour_to = 12;
      }

      if (mode == 'ba') {
        hour_from = 15;
        hour_to = 22;
      }

      for (var hour = hour_from; hour <= hour_to; hour++) {
        var departureDate = new Date();
        var adjust = -(departureDate.getDay() - 1);
        // Monday next week.
        departureDate.setSeconds(0);
        departureDate.setMinutes(0);
        departureDate.setDate(departureDate.getDate() + 7 + adjust);

        console.assert(departureDate.getDay() == 1);
        var local_timezone_offset = departureDate.getTimezoneOffset() / 60.0;

        var tz_hour_adjust = tz_offset_hours + local_timezone_offset;

        departureDate.setHours(hour - tz_hour_adjust);

        if (!printed_tz_debug) {
          printed_tz_debug = true;
          console.log('Timezone Debug:');
          console.log('  Query timezone offset: ', tz_offset_hours);
          console.log('  Local timezone offset: ', local_timezone_offset);
          console.log('  Hour adjust - subtracting ' + tz_hour_adjust + ' hours.');
          console.log('  Monday, ' + hour_from + 'am (target) is the same as following local time:');
          console.log('  ' + departureDate);
        }

        var mystart, myend;
        if (mode == 'ab') {
          mystart = start;
          myend = end;
        } else {
          mystart = end;
          myend = start;
        }
        var params = {
          origin: mystart,
          destination: myend,
          travelMode: 'DRIVING',
          drivingOptions: {
            departureTime: departureDate,
            trafficModel: 'pessimistic'
          }
        };

        var myParams = {
          hour: hour,
          mode: mode
        }

        batch.addRequest(function(params, myParams, done_callback) {
          directionsService.route(params, function(myParams, response, status) {
            if (status === 'OK') {
              if (response.routes.length > 0) {
                var route = response.routes[0];
                var leg = route.legs[0];

                var selector = ' .slot_ab';
                if (myParams.mode == 'ba') {
                  selector = ' .slot_ba';
                }

                if (leg && leg.duration_in_traffic) {
                  $('#time-' + myParams.hour + selector).text(leg.duration_in_traffic.text);
                } 

                if (!route_displayed) {
                  route_displayed = true;
                  directionsDisplay.setDirections(response);
                }
              }
            }

            done_callback(status);

          }.bind(this, myParams));
        }.bind(this, params, myParams));
      }
    }
    batch.execute();
  });
}
