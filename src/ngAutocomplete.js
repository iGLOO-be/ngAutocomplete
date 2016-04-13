/*global window*/

'use strict'

var querystring = require('querystring')
var angular = require('angular')

/**
 * A directive for adding google places autocomplete to a text box
 * google places autocomplete info: https://developers.google.com/maps/documentation/javascript/places
 *
 * Usage:
 *
 * <input type="text"  ng-autocomplete="options" ng-model="autocomplete" details="details/>
 *
 * + ng-model - autocomplete textbox value
 *
 * + details - more detailed autocomplete result, includes address parts, latlng, etc. (Optional)
 *
 * + options - configuration for the autocomplete (Optional)
 *
 *       + types: type,        String, values can be 'geocode', 'establishment', '(regions)', or '(cities)'
 *       + bounds: bounds,     Google maps LatLngBounds Object, biases results to bounds, but may return results outside these bounds
 *       + country: country    String, ISO 3166-1 Alpha-2 compatible country code. examples 'ca', 'us', 'gb'
 *       + watchEnter:         Boolean, true on Enter select top autocomplete result. false(default) enter ends autocomplete
 *
 * example:
 *
 *    options = {
 *        types: '(cities)',
 *        country: 'ca'
 *    }
**/

angular.module('ngAutocomplete', [])
  .service('ngAutocompleteGoogleApiLoader', ['$q', function ($q) {
    return function load (options) {
      var deferred = $q.defer()
      var script = null

      var callbackName = '__NG_AUTOCOMPLETE_GOOGLE_CALLBACK_' + new Date().getTime() + '_'
      window[callbackName] = function () {
        window[callbackName] = null
        document.body.removeChild(script)
        deferred.resolve(window.google)
      }

      includeScript()

      return deferred.promise

      function includeScript () {
        var url = '//maps.googleapis.com/maps/api/js?'
        url += querystring.stringify(Object.assign({
          callback: callbackName
        }, options))

        script = document.createElement('script')
        script.type = 'text/javascript'
        script.src = url
        document.body.appendChild(script)
      }
    }
  }])

  .provider('ngAutocompleteGoogleApi', function () {
    var provider = this

    this.options = {
      libraries: 'places',
      loader: null
    }

    this.configure = function (options) {
      angular.extend(provider.options, options)
    }

    this.$get = ['ngAutocompleteGoogleApiLoader', '$q', '$injector', function (loader, $q, $injector) {
      if (!provider._promise) {
        if (provider.options.loader) {
          provider._promise = $injector.invoke(provider.options.loader)
        } else {
          provider._promise = loader(provider.options)
        }
      }
      return provider._promise
    }]
  })

  .directive('ngAutocomplete', ['ngAutocompleteGoogleApi', function (ngAutocompleteGoogleApi) {
    return {
      require: 'ngModel',
      scope: {
        ngModel: '=',
        options: '=ngAutocomplete',
        details: '=?'
      },
      link: function (scope, element, attrs, controller) {
        // options for autocomplete
        var watchEnter = false
        // convert options provided to opts
        var initOpts = function () {
          if (!scope.options) {
            return
          }

          if (scope.options.watchEnter !== true) {
            watchEnter = false
          } else {
            watchEnter = true
          }

          if (scope.options.types) {
            scope.gPlace.setTypes([
              scope.options.types
            ])
          } else {
            scope.gPlace.setTypes([])
          }

          if (scope.options.bounds) {
            scope.gPlace.setBounds(scope.options.bounds)
          } else {
            scope.gPlace.setBounds(null)
          }

          if (scope.options.country) {
            scope.gPlace.setComponentRestrictions({
              country: scope.options.country
            })
          } else {
            scope.gPlace.setComponentRestrictions(null)
          }
        }

        // Prevent form submit on ENTER
        element.on('keydown', function (e) {
          if (e.keyCode === 13) {
            return false
          }
        })

        ngAutocompleteGoogleApi.then(function (google) {
          if (scope.gPlace === undefined) {
            scope.gPlace = new google.maps.places.Autocomplete(element[0], {})
          }
          google.maps.event.addListener(scope.gPlace, 'place_changed', function () {
            var result = scope.gPlace.getPlace()
            if (result !== undefined) {
              if (result.address_components !== undefined) {
                scope.$apply(function () {
                  scope.details = result

                  controller.$setViewValue(element.val())
                })
              } else {
                if (watchEnter) {
                  getPlace(result)
                }
              }
            }
          })

          // function to get retrieve the autocompletes first result using the AutocompleteService
          var getPlace = function (result) {
            var autocompleteService = new google.maps.places.AutocompleteService()
            if (result.name.length > 0) {
              autocompleteService.getPlacePredictions(
                {
                  input: result.name,
                  types: [scope.options.types],
                  offset: result.name.length
                },
                function listentoresult (list, status) {
                  if (list === null || list.length === 0) {
                    scope.$apply(function () {
                      scope.details = null
                    })
                  } else {
                    var placesService = new google.maps.places.PlacesService(element[0])
                    placesService.getDetails(
                      {'reference': list[0].reference},
                      function detailsresult (detailsResult, placesServiceStatus) {
                        if (placesServiceStatus === google.maps.GeocoderStatus.OK) {
                          scope.$apply(function () {
                            controller.$setViewValue(detailsResult.formatted_address)
                            element.val(detailsResult.formatted_address)

                            scope.details = detailsResult

                            // on focusout the value reverts, need to set it again.
                            element.on('focusout', function (event) {
                              element.val(detailsResult.formatted_address)
                              element.unbind('focusout')
                            })
                          })
                        }
                      }
                    )
                  }
                })
            }
          }

          // watch options provided to directive
          scope.$watch('options', initOpts, true)
        })
      }
    }
  }])
