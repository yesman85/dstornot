new Vue({
    el: '#app',
    data: {
        message: '',
        wakeup: '7:30',
        bedtime: '22:30',
        times: [],
        results: [],
        dstOffset: null,
        nonDstOffset: null
    },
    created: function () {
        for (var i = 0; i < 24; i++) {
            for (var j = 0; j < 60; j += 15) {
                this.times.push(i + ':' + (j === 0 ? '00' : j))
            }
        }
    },
    methods: {
        search: function (url) {
            var vm = this;
            var service = new google.maps.Geocoder();
            service.geocode({ address: this.message }, function (result) {
                if (result && result.length > 0) {
                    var lat = result[0].geometry.location.lat();
                    var lng = result[0].geometry.location.lng();

                    vm.calc(lat, lng);
                }
                else {
                    alert('unable to retrieve location');
                }
            })
        },
        calc: function (lat, lng) {

            this.times = [];
            this.results = [];
            this.dstOffset = null;
            this.nonDstOffset = null;

            var a = moment().month(0).date(1);
            var b = moment().month(11).date(31);

            var getTzName = function(date){
                var match = date.toDate().toString().match(/\((.*?)\)/);
                if (match && match[1])
                {
                    return match[1];
                }
            }

            var results = new Array();
            for (var m = moment(a); m.isBefore(b); m.add(1, 'days')) {
                var times = SunCalc.getTimes(m.toDate(), lat, lng);
                results.push(times);

                if (m.isDST() && !this.dstOffset) {
                    this.dstOffset = getTzName(m) + ' (' + m.format('Z') + ')';
                }
                if (!m.isDST() && !this.nonDstOffset) {
                    this.nonDstOffset = getTzName(m) + ' (' + m.format('Z') + ')';
                }
            }

            var r1 = this.getSeries(results, 0, ' DST in summer');
            var r2 = this.getSeries(results, -1, ' always DST');
            var r3 = this.getSeries(results, 1, ' never DST');

            var series = [
                r1.sunriseSeries,
                r1.sunsetSeries,
                r2.sunriseSeries,
                r2.sunsetSeries,
                r3.sunriseSeries,
                r3.sunsetSeries
            ];

            this.results = [
                r1.stats,
                r2.stats,
                r3.stats
            ]

            this.draw(series);
        },
        getSeries: function (results, diff, name) {

            var time1s = this.wakeup.split(':');
            var time2s = this.bedtime.split(':');

            var returnSunriseSeries = {
                name: 'sunrise ' + name,
                data: []
            }
            var returnSunsetSeries = {
                name: 'sunset ' + name,
                data: []
            }

            var earliestSunrise = Infinity;
            var earliestSunset = Infinity;
            var latestSunrise = 0;
            var latestSunset = 0;

            var mod = function (m) {
                return m.minutes() + m.hours() * 60;
            }

            var stats = {
                total: 0,
                most: 0,
                mostDay: null,
                least: Infinity,
                leastDay: null,
                avg: 0,
                earliestSunrise: null,
                earliestSunset: null,
                latestSunrise: null,
                latestSunset: null
            }

            results.forEach(function (result) {
                var sunrise = moment(result.sunrise);
                var sunset = moment(result.sunset);

                if (!sunrise.isDST() && diff === -1) {
                    sunrise.add(1, 'hour');
                    sunset.add(1, 'hour');
                }
                else if (sunrise.isDST() && diff === 1) {
                    sunrise.add(-1, 'hour');
                    sunset.add(-1, 'hour');
                }

                var time1 = moment(sunrise.toDate()).hours(time1s[0]).minutes(time1s[1]);
                var time2 = moment(sunset.toDate()).hours(time2s[0]).minutes(time2s[1]);

                var sunriseDiff = moment.duration(time1.diff(sunrise)).asMinutes();
                var sunsetDiff = moment.duration(sunset.diff(time2)).asMinutes();
                var daylength = moment.duration(sunset.diff(sunrise)).asMinutes();

                if (daylength > stats.most) {
                    stats.most = daylength;
                    stats.mostDay = time1.format('MMM D')
                }
                if (daylength < stats.least) {
                    stats.least = daylength;
                    stats.leastDay = time1.format('MMM D')
                }

                if (sunriseDiff > 0) {
                    daylength += sunriseDiff;
                }
                if (sunsetDiff > 0) {
                    daylength += sunsetDiff;
                }

                if (mod(sunrise) < earliestSunrise) {
                    earliestSunrise = mod(sunrise);
                    stats.earliestSunrise = sunrise.format('MMM D HH:mm');
                }

                if (mod(sunset) < earliestSunset) {
                    earliestSunset = mod(sunset);
                    stats.earliestSunset = sunset.format('MMM D HH:mm');
                }

                if (mod(sunrise) > latestSunrise) {
                    latestSunrise = mod(sunrise);
                    stats.latestSunrise = sunrise.format('MMM D HH:mm');
                }

                if (mod(sunset) > latestSunset) {
                    latestSunset = mod(sunset);
                    stats.latestSunset = sunset.format('MMM D HH:mm');
                }

                stats.total += daylength;

                var date = Date.UTC(sunrise.year(), sunrise.month(), sunrise.date());
                sunrise = Date.UTC(2017, 0, 1, sunrise.hours(), sunrise.minutes(), 0);
                sunset = Date.UTC(2017, 0, 1, sunset.hours(), sunset.minutes(), 0);

                returnSunriseSeries.data.push([date, sunrise])
                returnSunsetSeries.data.push([date, sunset]);
            });

            stats.avg = stats.total / 365;

            return {
                sunriseSeries: returnSunriseSeries,
                sunsetSeries: returnSunsetSeries,
                stats: stats
            }
        },
        draw: function (series) {
            Highcharts.chart('container', {
                title: {
                    text: ''
                },
                subtitle: {
                    text: ''
                },
                chart: {
                    zoomType: 'x'
                },
                xAxis: {
                    type: 'datetime',
                    title: {
                        text: 'Day of the year'
                    }
                },
                yAxis: {
                    type: 'datetime',
                    title: {
                        text: 'Time of day'
                    }
                },
                legend: {
                    enabled: true
                },
                tooltip: {
                    formatter: function () {
                        return this.series.name + ' on ' + Highcharts.dateFormat('%e %b %Y', new Date(this.x)) + ' is at ' + Highcharts.dateFormat('%H:%M', new Date(this.y));
                    }
                },
                series: series
            });
        }
    }
})

Vue.filter('mins', function (value) {
    var minutes = Math.floor(value % 60);
    var hours = Math.floor(value / 60);
    minutes = ('0' + minutes).substr(-2);
    return hours + ':' + minutes;
});