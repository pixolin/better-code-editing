/* global wp */
/* eslint consistent-this: [ "error", "control" ] */
/* eslint no-magic-numbers: ["error", { "ignore": [0,1,-1] }] */
wp.customHtmlWidgets = ( function( $ ) {
	'use strict';

	var component = {
		idBases: [ 'custom_html' ],
		codeEditorSettings: {},
		l10n: {
			errorNotice: {
				singular: '',
				plural: ''
			}
		}
	};

	/**
	 * Text widget control.
	 *
	 * @class CustomHtmlWidgetControl
	 * @constructor
	 * @abstract
	 */
	component.CustomHtmlWidgetControl = Backbone.View.extend({

		/**
		 * View events.
		 *
		 * @type {Object}
		 */
		events: {},

		/**
		 * Initialize.
		 *
		 * @param {Object} options - Options.
		 * @param {jQuery} options.el - Control field container element.
		 * @param {jQuery} options.syncContainer - Container element where fields are synced for the server.
		 * @returns {void}
		 */
		initialize: function initialize( options ) {
			var control = this;

			if ( ! options.el ) {
				throw new Error( 'Missing options.el' );
			}
			if ( ! options.syncContainer ) {
				throw new Error( 'Missing options.syncContainer' );
			}

			Backbone.View.prototype.initialize.call( control, options );
			control.syncContainer = options.syncContainer;
			control.widgetIdBase = control.syncContainer.parent().find( '.id_base' ).val();
			control.widgetNumber = control.syncContainer.parent().find( '.widget_number' ).val();
			control.customizeSettingId = 'widget_' + control.widgetIdBase + '[' + String( control.widgetNumber ) + ']';

			control.$el.addClass( 'custom-html-widget-fields' );
			control.$el.html( wp.template( 'widget-custom-html-control-fields' )( { codeEditorDisabled: component.codeEditorSettings.disabled } ) );

			control.errorNoticeContainer = control.$el.find( '.code-editor-error-container' );
			control.currentErrorAnnotations = [];
			control.previousErrorCount = 0;
			control.saveButton = control.syncContainer.add( control.syncContainer.parent().find( '.widget-control-actions' ) ).find( '.widget-control-save, #savewidget' );
			control.saveButton.addClass( 'custom-html-widget-save-button' ); // To facilitate style targeting.

			control.fields = {
				title: control.$el.find( '.title' ),
				content: control.$el.find( '.content' )
			};

			// Sync input fields to hidden sync fields which actually get sent to the server.
			_.each( control.fields, function( fieldInput, fieldName ) {
				fieldInput.on( 'input change', function updateSyncField() {
					var syncInput = control.syncContainer.find( '.sync-input.' + fieldName );
					if ( syncInput.val() !== fieldInput.val() ) {
						syncInput.val( fieldInput.val() );
						syncInput.trigger( 'change' );
					}
				});

				// Note that syncInput cannot be re-used because it will be destroyed with each widget-updated event.
				fieldInput.val( control.syncContainer.find( '.sync-input.' + fieldName ).val() );
			});
		},

		/**
		 * Update input fields from the sync fields.
		 *
		 * This function is called at the widget-updated and widget-synced events.
		 * A field will only be updated if it is not currently focused, to avoid
		 * overwriting content that the user is entering.
		 *
		 * @returns {void}
		 */
		updateFields: function updateFields() {
			var control = this, syncInput;

			if ( ! control.fields.title.is( document.activeElement ) ) {
				syncInput = control.syncContainer.find( '.sync-input.title' );
				control.fields.title.val( syncInput.val() );
			}

			/*
			 * Prevent updating content when the editor is focused or if there are current error annotations,
			 * to prevent the editor's contents from getting sanitized as soon as a user removes focus from
			 * the editor. This is particularly important for users who cannot unfiltered_html.
			 */
			control.contentUpdateBypassed = control.fields.content.is( document.activeElement ) || control.editor && control.editor.state.focused || 0 !== control.currentErrorAnnotations;
			if ( ! control.contentUpdateBypassed ) {
				syncInput = control.syncContainer.find( '.sync-input.content' );
				control.fields.content.val( syncInput.val() ).trigger( 'change' );
			}
		},

		/**
		 * Show linting error notice.
		 *
		 * @returns {void}
		 */
		updateErrorNotice: function() {
			var control = this, errorNotice, message, customizeSetting;

			if ( control.previousErrorCount === control.currentErrorAnnotations.length ) {
				return;
			}
			control.previousErrorCount = control.currentErrorAnnotations.length;

			control.saveButton.prop( 'disabled', 0 !== control.currentErrorAnnotations.length );

			if ( 1 === control.currentErrorAnnotations.length ) {
				message = component.l10n.errorNotice.singular.replace( '%d', '1' );
			} else {
				message = component.l10n.errorNotice.plural.replace( '%d', String( control.currentErrorAnnotations.length ) );
			}

			if ( wp.customize && wp.customize.has( control.customizeSettingId ) ) {
				customizeSetting = wp.customize( control.customizeSettingId );
				customizeSetting.notifications.remove( 'htmllint_error' );
				if ( 0 !== control.currentErrorAnnotations.length ) {
					customizeSetting.notifications.add( 'htmllint_error', new wp.customize.Notification( 'htmllint_error', {
						message: message,
						type: 'error'
					} ) );
				}
			} else if ( 0 !== control.currentErrorAnnotations.length ) {
				errorNotice = $( '<div class="inline notice notice-error notice-alt"></div>' );
				errorNotice.append( $( '<p></p>', {
					text: message
				} ) );
				control.errorNoticeContainer.empty();
				control.errorNoticeContainer.append( errorNotice );
				control.errorNoticeContainer.slideDown( 'fast' );
				wp.a11y.speak( message );
			} else {
				control.errorNoticeContainer.slideUp( 'fast' );
			}
		},

		/**
		 * Initialize editor.
		 *
		 * @returns {void}
		 */
		initializeEditor: function initializeEditor() {
			var control = this, settings;

			if ( component.codeEditorSettings.disabled ) {
				return;
			}

			settings = _.extend( {}, component.codeEditorSettings, {
				handleTabPrev: function() {
					control.fields.title.focus();
				},
				handleTabNext: function() {
					var tabbables = control.syncContainer.add( control.syncContainer.parent().find( '.widget-position, .widget-control-actions' ) ).find( ':tabbable' );
					tabbables.first().focus();
				}
			});

			if ( settings.codemirror.lint ) {
				if ( true === settings.codemirror.lint ) {
					settings.codemirror.lint = {};
				}
				settings.codemirror.lint = _.extend( {}, settings.codemirror.lint, {
					onUpdateLinting: function( annotations, annotationsSorted, editor ) {
						control.currentErrorAnnotations = _.filter( annotations, function( annotation ) {
							return 'error' === annotation.severity;
						} );

						/*
						 * Update notifications when the editor is not focused to prevent error message
						 * from overwhelming the user during input, unless there are no annotations
						 * or there are previous notifications already being displayed, and in that
						 * case update immediately so they can know that they fixed the errors.
						 */
						if ( ! editor.state.focused || 0 === control.currentErrorAnnotations.length || control.previousErrorCount > 0 ) {
							control.updateErrorNotice();
						}
					}
				});
			}

			control.editor = wp.codeEditor.initialize( control.fields.content, settings );
			control.fields.content.on( 'change', function() {
				if ( this.value !== control.editor.getValue() ) {
					control.editor.setValue( this.value );
				}
			});
			control.editor.on( 'change', function() {
				var value = control.editor.getValue();
				if ( value !== control.fields.content.val() ) {
					control.fields.content.val( value ).trigger( 'change' );
				}
			});

			// Show the error notice when the user leaves the editor.
			if ( settings.codemirror.lint ) {
				control.editor.on( 'blur', function() {
					control.updateErrorNotice();
				});
				$( control.editor.display.wrapper ).on( 'mouseout', function() {
					control.updateErrorNotice();
				});
			}

			// Make sure the editor gets updated if the content was updated on the server (sanitization) but not updated in the editor since it was focused.
			control.editor.on( 'blur', function() {
				if ( control.contentUpdateBypassed ) {
					control.syncContainer.find( '.sync-input.content' ).trigger( 'change' );
				}
			});
		}
	});

	/**
	 * Mapping of widget ID to instances of CustomHtmlWidgetControl subclasses.
	 *
	 * @type {Object.<string, wp.textWidgets.CustomHtmlWidgetControl>}
	 */
	component.widgetControls = {};

	/**
	 * Handle widget being added or initialized for the first time at the widget-added event.
	 *
	 * @param {jQuery.Event} event - Event.
	 * @param {jQuery}       widgetContainer - Widget container element.
	 * @returns {void}
	 */
	component.handleWidgetAdded = function handleWidgetAdded( event, widgetContainer ) {
		var widgetForm, idBase, widgetControl, widgetId, animatedCheckDelay = 50, renderWhenAnimationDone, fieldContainer, syncContainer;
		widgetForm = widgetContainer.find( '> .widget-inside > .form, > .widget-inside > form' ); // Note: '.form' appears in the customizer, whereas 'form' on the widgets admin screen.

		idBase = widgetForm.find( '> .id_base' ).val();
		if ( -1 === component.idBases.indexOf( idBase ) ) {
			return;
		}

		// Prevent initializing already-added widgets.
		widgetId = widgetForm.find( '.widget-id' ).val();
		if ( component.widgetControls[ widgetId ] ) {
			return;
		}

		/*
		 * Create a container element for the widget control fields.
		 * This is inserted into the DOM immediately before the the .widget-content
		 * element because the contents of this element are essentially "managed"
		 * by PHP, where each widget update cause the entire element to be emptied
		 * and replaced with the rendered output of WP_Widget::form() which is
		 * sent back in Ajax request made to save/update the widget instance.
		 * To prevent a "flash of replaced DOM elements and re-initialized JS
		 * components", the JS template is rendered outside of the normal form
		 * container.
		 */
		fieldContainer = $( '<div></div>' );
		syncContainer = widgetContainer.find( '.widget-content:first' );
		syncContainer.before( fieldContainer );

		widgetControl = new component.CustomHtmlWidgetControl({
			el: fieldContainer,
			syncContainer: syncContainer
		});

		component.widgetControls[ widgetId ] = widgetControl;

		/*
		 * Render the widget once the widget parent's container finishes animating,
		 * as the widget-added event fires with a slideDown of the container.
		 * This ensures that the textarea is visible and the editor can be initialized.
		 */
		renderWhenAnimationDone = function() {
			if ( ! ( wp.customize ? widgetContainer.parent().hasClass( 'expanded' ) : widgetContainer.hasClass( 'open' ) ) ) { // Core merge: The wp.customize condition can be eliminated with this change being in core: https://github.com/xwp/wordpress-develop/pull/247/commits/5322387d
				setTimeout( renderWhenAnimationDone, animatedCheckDelay );
			} else {
				widgetControl.initializeEditor();
			}
		};
		renderWhenAnimationDone();
	};

	/**
	 * Setup widget in accessibility mode.
	 *
	 * @returns {void}
	 */
	component.setupAccessibleMode = function setupAccessibleMode() {
		var widgetForm, idBase, widgetControl, fieldContainer, syncContainer;
		widgetForm = $( '.editwidget > form' );
		if ( 0 === widgetForm.length ) {
			return;
		}

		idBase = widgetForm.find( '> .widget-control-actions > .id_base' ).val();
		if ( -1 === component.idBases.indexOf( idBase ) ) {
			return;
		}

		fieldContainer = $( '<div></div>' );
		syncContainer = widgetForm.find( '> .widget-inside' );
		syncContainer.before( fieldContainer );

		widgetControl = new component.CustomHtmlWidgetControl({
			el: fieldContainer,
			syncContainer: syncContainer
		});

		widgetControl.initializeEditor();
	};

	/**
	 * Sync widget instance data sanitized from server back onto widget model.
	 *
	 * This gets called via the 'widget-updated' event when saving a widget from
	 * the widgets admin screen and also via the 'widget-synced' event when making
	 * a change to a widget in the customizer.
	 *
	 * @param {jQuery.Event} event - Event.
	 * @param {jQuery}       widgetContainer - Widget container element.
	 * @returns {void}
	 */
	component.handleWidgetUpdated = function handleWidgetUpdated( event, widgetContainer ) {
		var widgetForm, widgetId, widgetControl, idBase;
		widgetForm = widgetContainer.find( '> .widget-inside > .form, > .widget-inside > form' );

		idBase = widgetForm.find( '> .id_base' ).val();
		if ( -1 === component.idBases.indexOf( idBase ) ) {
			return;
		}

		widgetId = widgetForm.find( '> .widget-id' ).val();
		widgetControl = component.widgetControls[ widgetId ];
		if ( ! widgetControl ) {
			return;
		}

		widgetControl.updateFields();
	};

	/**
	 * Initialize functionality.
	 *
	 * This function exists to prevent the JS file from having to boot itself.
	 * When WordPress enqueues this script, it should have an inline script
	 * attached which calls wp.textWidgets.init().
	 *
	 * @param {object} settings - Options for code editor, exported from PHP.
	 * @returns {void}
	 */
	component.init = function init( settings ) {
		var $document = $( document );
		_.extend( component.codeEditorSettings, settings );

		$document.on( 'widget-added', component.handleWidgetAdded );
		$document.on( 'widget-synced widget-updated', component.handleWidgetUpdated );

		/*
		 * Manually trigger widget-added events for media widgets on the admin
		 * screen once they are expanded. The widget-added event is not triggered
		 * for each pre-existing widget on the widgets admin screen like it is
		 * on the customizer. Likewise, the customizer only triggers widget-added
		 * when the widget is expanded to just-in-time construct the widget form
		 * when it is actually going to be displayed. So the following implements
		 * the same for the widgets admin screen, to invoke the widget-added
		 * handler when a pre-existing media widget is expanded.
		 */
		$( function initializeExistingWidgetContainers() {
			var widgetContainers;
			if ( 'widgets' !== window.pagenow ) {
				return;
			}
			widgetContainers = $( '.widgets-holder-wrap:not(#available-widgets)' ).find( 'div.widget' );
			widgetContainers.one( 'click.toggle-widget-expanded', function toggleWidgetExpanded() {
				var widgetContainer = $( this );
				component.handleWidgetAdded( new jQuery.Event( 'widget-added' ), widgetContainer );
			});

			// Accessibility mode.
			$( window ).on( 'load', function() {
				component.setupAccessibleMode();
			});
		});
	};

	return component;
})( jQuery );
