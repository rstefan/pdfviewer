/*
 * Copyright 2014 Ambris
 *
 * Project : Very simple PDF viewer jQuery plugin
 * Version : 0.1
 * author: Richard Stefan (richard.stefan@ambris.com)
 *
 * Licensed under the Apache License, Version 2.0(the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http: //www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function($) {
    $.pdfviewer = function(element, options) {

        var defaults = {
            href: '', // for demonstration purpose
            scale: 1.0,
            autoFit: false,
            toolbar_template: '<div class="pdf-toolbar">' +
                '<button id="pdf-prev">Previous</button>' +
                '<button id="pdf-next">Next</button>' +
                '<span class="pdf-pager">Page:<span id="pdf-page-num"></span>/<span id="pdf-page-count"></span></span>' +
                '<button id="pdf-autofit-height">Adjust Height</button>' +
                '<button id="pdf-autofit-width">Adjust Width</button>' +
                '<button id="pdf-autofit">Auto fit</button>' +
                '</div>',
            viewer_template: '<div class="pdf-canvas"><canvas id="pdf-the-canvas"></canvas></div>',

            onPrevPage: function() {
                return true;
            },
            onNextPage: function() {
                return true;
            },
            onDocumentLoaded: function() {},
            onBeforeRenderPage: function(num) {
                return true;
            },
            onRenderedPage: function(num) {}
        }

        var plugin = this;

        plugin.settings = {};

        var $element = $(element), // reference to the jQuery version of DOM element
            element = element, // reference to the actual DOM element
            elt_width = $element.innerWidth(),
            elt_heigth = $element.innerHeight();

        var pdfDoc = null,
            pageNum = 1,
            pageRendering = false,
            pageNumPending = null,
            scale = 1.0,
            canvas = null,
            ctx = null;

        plugin.init = function() {

            options = options || {};
            options.href = options.href || $element.data('href');

            plugin.settings = $.extend({}, defaults, options);

            $element.html(build());

            if (!PDFJS) {
                console.log('pdf.js not loaded. Add "pdf.js" to your page.');
                return this;
            }

            PDFJS.disableWorker = true;

            scale = plugin.settings.scale;
            canvas = $('#pdf-the-canvas', element).get(0);
            ctx = canvas.getContext('2d');


            $('#pdf-prev', element).on('click', plugin.prevPage);
            $('#pdf-next', element).on('click', plugin.nextPage);
            $('#pdf-autofit-height', element).on('click', plugin.autoFitScaleByHeight);
            $('#pdf-autofit-width', element).on('click', plugin.autoFitScaleByWidth);
            $('#pdf-autofit', element).on('click', plugin.autoFit);

            /**
             * Asynchronously downloads PDF.
             */
            PDFJS.getDocument(plugin.settings.href).then(function(pdfDoc_) {
                pdfDoc = pdfDoc_;
                plugin.settings.onDocumentLoaded.call(element);

                $('#pdf-page-count', element).text(pdfDoc.numPages);

                // Initial/first page rendering
                plugin.renderPage(pageNum);
            });
        };


        // public methods
        /**
         * Get page info from document, resize canvas accordingly, and render page.
         * @param num Page number.
         */
        plugin.renderPage = function(num) {

            if (!plugin.settings.onBeforeRenderPage.call(element, num)) return;

            pageRendering = true;
            // Using promise to fetch the page
            pdfDoc.getPage(num).then(function(page) {
                var viewport = page.getViewport(scale);
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                if (canvas.width < $(canvas).parent().width() - 20)
                    $(canvas).css('left', (($(canvas).parent().width() - canvas.width) / 2));
                else
                    $(canvas).css('left', 0);

                // Render PDF page into canvas context
                var renderContext = {
                    canvasContext: ctx,
                    viewport: viewport
                };
                var renderTask = page.render(renderContext);

                // Wait for rendering to finish
                renderTask.promise.then(function() {
                    pageRendering = false;

                    plugin.settings.onRenderedPage.call(element, num);

                    if (pageNumPending !== null) {
                        // New page rendering is pending
                        renderPage(pageNumPending);
                        pageNumPending = null;
                    }
                });
            });

            // Update page counters
            $('#pdf-page-num', element).text(pageNum);
        };

        plugin.currentPage = function() {
            return pageNum;
        };

        plugin.pages = function() {
            return pdfDoc.numPages;
        };

        /**
         * Displays previous page.
         */
        plugin.prevPage = function() {
            if (!plugin.settings.onPrevPage.call(element)) return;

            if (pageNum <= 1) {
                return;
            }
            pageNum--;
            queueRenderPage(pageNum);
        };

        /**
         * Displays next page.
         */
        plugin.nextPage = function() {
            if (!plugin.settings.onNextPage.call(element)) return;

            if (pageNum >= pdfDoc.numPages) {
                return;
            }
            pageNum++;
            queueRenderPage(pageNum);
        }

        plugin.autoFit = function() {
            pdfDoc.getPage(pageNum).then(function(page) {
                var parentHeight = $(canvas).parent().height() - 5;
                var parentWidth = $(canvas).parent().width() - 20;
                var viewport = page.getViewport(1.0);

                if (parentHeight <= parentWidth)
                    plugin.autoFitScaleByHeight();
                else
                    plugin.autoFitScaleByWidth();
            });
        }


        plugin.autoFitScaleByHeight = function() {
            pdfDoc.getPage(pageNum).then(function(page) {
                var parentHeight = $(canvas).parent().height() - 5;

                var viewport = page.getViewport(1.0);
                scale = parentHeight / viewport.height;

                queueRenderPage(pageNum);
            });
        }

        plugin.autoFitScaleByWidth = function() {
            pdfDoc.getPage(pageNum).then(function(page) {
                var parentWidth = $(canvas).parent().width() - 20;

                var viewport = page.getViewport(1.0);
                scale = parentWidth / viewport.width;

                queueRenderPage(pageNum);
            });
        }

        // private methods
        // these methods can be called only from inside the plugin like:
        // methodName(arg1, arg2, ... argn)
        var build = function() {
            return plugin.settings.toolbar_template + plugin.settings.viewer_template;
        }

        /**
         * If another page rendering in progress, waits until the rendering is
         * finised. Otherwise, executes rendering immediately.
         */
        var queueRenderPage = function(num) {
            if (pageRendering) {
                pageNumPending = num;
            } else {
                plugin.renderPage(num);
            }
        }


        // fire up the plugin!
        // call the "constructor" method
        plugin.init();
    }

    // add the plugin to the jQuery.fn object
    $.fn.pdfviewer = function(options) {

        // iterate through the DOM elements we are attaching the plugin to
        return this.each(function() {

            // if plugin has not already been attached to the element
            if (undefined == $(this).data('pdfviewer')) {

                // create a new instance of the plugin
                // pass the DOM element and the user-provided options as arguments
                var plugin = new $.pdfviewer(this, options);

                // in the jQuery version of the element
                // store a reference to the plugin object
                // you can later access the plugin and its methods and properties like
                // element.data('pdfviewer').publicMethod(arg1, arg2, ... argn) or
                // element.data('pdfviewer').settings.propertyName
                $(this).data('pdfviewer', plugin);

            }

        });

    }

})(jQuery);