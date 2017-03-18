function initMap() {
  var map = new google.maps.Map(document.getElementById('map'), {
      zoom: 11,
      center: { lat: 37.779236, lng: -122.449621 },
      mapTypeControl: false
    });

  initApp(map);
}

function initApp(map) {
  var directionsDisplay = new google.maps.DirectionsRenderer;
  var directionsService = new google.maps.DirectionsService;

  directionsDisplay.setMap(map);

  var control = document.getElementById('floating-panel');
  control.style.display = 'block';
  map.controls[google.maps.ControlPosition.TOP_CENTER].push(control);

  initTable();

  var startShow = function() {
    showDrivingTimes(directionsService, directionsDisplay);
  }

  var handleEnter = function(e) {
    if (e.keyCode == 13) {
      startShow();
    }
  }
  $('input').keyup(handleEnter);
  $('#go').click(startShow);
}

function initTable() {
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
  var per_second = 2;
  this.wait_time = 1.0 / per_second * 1000.0;
  this.batch = [];
  this.done = [];
}

ThrottledBatch.prototype.addRequest = function(func) {
  this.batch.push(func);
  this.done.push(false);
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
      } else if (status == 'ZERO_RESULTS' || status == 'NOT_FOUND') {
        $('#noroute').show();
      } else {
        console.log('Oops, waiting..');
        setTimeout(function() {
          me.executeOne(index);
        }, 1000);
      }
    });
  }
}

ThrottledBatch.prototype.execute = function() {
  console.log('Executing', this.batch.length, 'requests');

  this.executeOne(0);
}

function showDrivingTimes(directionsService, directionsDisplay) {
  $('#noroute').hide();
  var start = $('#address-from').val();
  var end = $('#address-to').val();

  var batch = new ThrottledBatch();

  var modes = ['ab', 'ba'];

  var is_displayed = false;

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
      var d = new Date();
      var adjust = -(d.getDay() - 1);
      d.setDate(d.getDate() + 7 + adjust);

      console.assert(d.getDay() == 1);

      d.setHours(hour);

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
          departureTime: d,
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
            }

            var selector = ' .slot_ab';
            if (myParams.mode == 'ba') {
              selector = ' .slot_ba';
            }

            $('#time-' + myParams.hour + selector).text(leg.duration_in_traffic.text);

            if (!is_displayed) {
              is_displayed = true;
              directionsDisplay.setDirections(response);
            }
          }

          done_callback(status);

        }.bind(this, myParams));
      }.bind(this, params, myParams));
    }
  }

  batch.execute();
}
