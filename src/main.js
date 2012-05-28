(function($) {

    _.mixin({
        // Returns a two digit string representation of a number.
        // This is useful for workin in a small Cartesian plane where points looks like (02,05), (20,42) etc.
        // NOTE: Truncates numbers having 3 or more digits
        toTwoDigitString: function(number) {
            if(number<10) {
                return '0' + number;
            }
            else if(number<100) {
                return number.toString();
            }
            else {
                return number.toString().substr(0, 2);
            }
        }
    });

    // Returns 8 neighbors surrounding a tile (at a point) in a 2D Cartesian plane.
    $.fn.neighbors = function() {
        var $tile = $(this[0]);
        var xpart = $tile.attr('id').substr(0, 2);
        var ypart = $tile.attr('id').substr(2, 2);
        var x = parseInt(xpart, 10);
        var y = parseInt(ypart, 10);
        var coords = [[x+1, y], [x-1, y], [x, y+1], [x, y-1], [x+1, y+1], [x-1, y+1], [x-1, y-1], [x+1, y-1]];
        var neighbors = _.map(coords, function(coord) {
            return $('#' + _.toTwoDigitString(coord[0]) + _.toTwoDigitString(coord[1]))[0];
        });
        return $(neighbors);
    }

    $(function() {
        // Game namespace
        var Game = {
            // Initial settings
            _FIELD: { x: 8, y: 8 },
            _MINES: 10,
            _GUESS: true,
            _GAMEON: false,
            // Computed settings
            _mine_locations: new Array(),
            _tiles: 0,
            _unplanted_flags: 0,
            // jQuery elements
            $field: $('#field'),
            $menu: $('#menu'),
            $smiley: $('#smiley'),
            $tilewrap: $('<div>').attr('id', 'tilewrap'),

            // Initializes the game
            init: _.once(function() {
                this.manage_settings();
                this.load_settings();
                this.generate_field();
                this.plant_mine_locations();
                this.enable_actions();
                this.handle_menu();
            }),

            // New/Reset game
            newgame: function(options) {
                var options = options || {};
                var nostart = options.nostart || false; // nostart is true when a game is refreshed without ending in a loss or win
                var notile = options.notile || false; // notile is true when game is refreshed without ending and with same field size
                this._GAMEON = false;
                this._mine_locations = new Array();
                this._tiles = 0;
                this._unplanted_flags = 0;
                this.load_settings();
                if(!notile) {
                    this.generate_field();
                }
                this.plant_mine_locations();
                if(!nostart) {
                    this.game_start();
                }
            },

            // Allows a game to start by enabling actions on tiles.
            game_start: function() {
                this.enable_actions();
            },
            // Handles ending a game.
            // Displays appropriate variant of smiley face.
            // Disables user actions on tiles.
            game_over: function(checked_win, validate) {
                var won = checked_win || false;
                if(!won) {
                    won = this.check_win(validate);
                }
                if(won) {
                    this.$smiley.addClass('won');
                }
                else {
                    this.$smiley.addClass('lost');
                }
                this.enable_actions(false);
                this.reveal_mine_locations(won);
                this._unplanted_flags = 0;
            },

            // Sets up event handlers for interaction with tiles.
            enable_actions: function(enable) {
                var action = true;
                if(enable === false) {
                    action = false;
                }
                var eventsmap = {'mousedown': this.click_tile};
                var wrap = this.$tilewrap;
                if(action) {
                    wrap.on(eventsmap, '.tile.covered', this);
                }
                else {
                    wrap.off(eventsmap, '.tile.covered');
                }
            },

            // Handles mouse events on tiles to support gameplay.
            click_tile: function(event) {
                event.data._GAMEON = true; // game is running when user clicks on a tile
                var $tile = $(this);
                switch(event.which) {
                    case 1: // left click
                        if($tile.hasClass('flag')) {
                            return;
                        }
                        if($tile.data().hasMine) {
                            $tile.removeClass('covered').addClass('uncovered explosion');
                            event.data.game_over();
                        }
                        else {
                            $tile.removeClass('covered').addClass('uncovered');
                            event.data._tiles -= 1;
                            event.data.cascade_reveal($tile);
                            if(event.data.check_win()) {
                                event.data.game_over(true);
                            }
                        }
                        break;
                    case 3: // right click
                        if($tile.hasClass('flag')) {
                            $tile.removeClass('flag').data({ hasFlag: false });
                            event.data.updateCounter(1);
                            if(event.data._GUESS) {
                                $tile.addClass('guess').data({ hasGuess: true });
                            }
                        }
                        else if($tile.hasClass('guess')) {
                            $tile.removeClass('guess').data({ hasGuess: false });
                        }
                        else {
                            $tile.addClass('flag').data({ hasFlag: true });
                            event.data.updateCounter(-1);
                            if(event.data.check_win()) {
                                event.data.game_over(true);
                            }
                        }
                }
            },

            // Handles changes to conifgurable settings (Mines %, Tiles Across, Tiles Down).
            // Resets the game if it is currently not running.
            // Enables dynamic resize of minefield and re-laying of mines.
            manage_settings: function() {
                var settings = {'#mines': '#minecount', '#across': '#tilesacross', '#down': '#tilesdown'};
                var that = this;
                _.each(settings, function(op, ip) {
                    $(ip).change(function() {
                        var $set = $(this);
                        $(op).text($set.val());
                        if(!that._GAMEON) {
                            if($set.attr('id') == '#mines') {
                                that.newgame({ nostart: true, notile: true });
                            }
                            else {
                                that.newgame({ nostart: true });
                            }
                        }
                    });
                });
            },

            // Loads new settings into the game and sets appropriate values.
            load_settings: function() {
                this._FIELD.x = parseInt($('#tilesacross').text(), 10);
                this._FIELD.y = parseInt($('#tilesdown').text(), 10);
                this._tiles = this._FIELD.x * this._FIELD.y;
                this._MINES = Math.round((parseInt($('#minecount').text(), 10) * this._tiles) / 100);
            },

            // Handles menu actions invoked by clicking the smiley face or the cheat option.
            // Delegates events to other functions.
            handle_menu: function() {
                var that = this;
                $('#smiley').click(function(e) {
                    if(that._unplanted_flags < 0) {
                        return false;
                    }
                    else if(that._unplanted_flags > 0) {
                        that.newgame({ nostart: true });
                    }
                    else if($(this).hasClass('won') || $(this).hasClass('lost')) {
                        $(this).removeClass('won').removeClass('lost');
                        that.newgame();
                    }
                    else {
                        that.game_over(false, true);
                    }
                });
                var cheatevents = { 'mousedown': this.cheat, 'mouseup': this.uncheat };
                this.$menu.on(cheatevents, '#cheat span', this);
            },

            // Generates and displays a 2D minefield.
            // The tiles (<div>s) are appended to the field as a single list and displayed as floating elements.
            // Tiles appear in a mxn grid by virtue of setting appropriate width and height for the field.
            generate_field: function() {
                var wrap = this.$tilewrap;
                wrap.empty();
                var across = this._FIELD.x;
                var down = this._FIELD.y;
                wrap.width(across*1.15 + 'em');
                wrap.height(down*1.15 + 'em');
                this.$menu.width(across*1.15 + 'em');
                // the actual field is larger than the true grid size by one extra tile on each side.
                // so there are 2 extra tiles per dimension in 2D.
                // the extra tiles help with iterative function calls on tiles
                // by eliminating the need for treating tiles near sides and corners as special cases.
                var x = across+ 2;
                var y = down + 2;
                var that = this;
                _.each(_.range(x * y), function(i) {
                    var xcoord = i % x;
                    var ycoord = Math.floor(i / x);
                    var tile = $('<div>').attr({'id': _.toTwoDigitString(xcoord) + _.toTwoDigitString(ycoord), 'class': 'tile'})
                    .data({ hasFlag: false });
                    if(xcoord == 0 || xcoord == x-1 || ycoord == 0 || ycoord == y-1) {
                        tile.addClass('outside uncovered');
                    }
                    else {
                        tile.addClass('covered');
                    }
                    $(wrap).append(tile);
                });
                wrap.bind('contextmenu', function(e) { e.preventDefault(); }); // right click contextmenu on tiles is uncool
                this.$field.append(wrap);
            },

            // Plants required number of mines at random tile locations
            // by setting data hasMine: true on tile elements.
            // Also stores coordinates of mine locations in global _mine_locations.
            plant_mine_locations: function() {
                var tiles_covered = $('.tile.covered').data({ hasMine: false });
                var minecount = this._MINES;
                var that = this;
                var randoms = {};
                _.each(_.range(minecount), function() {
                    var rand = 0;
                    while(1) {
                        rand = Math.floor(Math.random() * tiles_covered.length);
                        if(!randoms[rand]) {
                            randoms[rand] = 1;
                            break;
                        }
                    }
                    var mine = $(tiles_covered[rand]);
                    mine.data({ hasMine: true });
                    that._mine_locations.push(mine.attr('id'));
                });
                this.updateCounter(minecount);
            },

            // Updates the running count of unplanted flags
            updateCounter: function(change) {
                var change = change || 0;
                this._unplanted_flags += change;
                $('#counter').text(this._unplanted_flags);
            },

            // Reveals mine locations.
            // Called when game ends in a win or a loss.
            reveal_mine_locations: function(won) {
                var won = won || false;
                _.each(this._mine_locations, function(id) {
                    var $tile = $('#'+id);
                    $tile.removeClass('covered').addClass('uncovered');
                    if(won) {
                        $tile.addClass('reveal_mine_won');
                    }
                    else if($tile.hasClass('flag')) {
                        $tile.addClass('reveal_mine');
                    }
                    else if(!$tile.hasClass('explosion')) {
                        $tile.addClass('reveal_mine_wrong').html($('<span>').text('X'));
                    }
                });
            },

            // Reveals tiles having no mines around them in a cascading manner.
            // A cascade happens when a contiguous region of the field is free of mines.
            // Also sets minecounts on border tiles which have non-zero neighboring mines
            // and were therefore not revealed during the cascade.
            // NOTE: RECURSION
            cascade_reveal: function($tile) {
                var count = 0;
                var $neighbors = $tile.neighbors();
                $neighbors.each(function(i, tile) {
                    if($(tile).data().hasMine) {
                        count += 1;
                    }
                });
                if(count == 0) {
                    var covered = $neighbors.filter('.covered');
                    var tiles = covered.filter(':not(.flag)');
                    tiles.removeClass('covered').addClass('uncovered');
                    this._tiles -= tiles.length;
                    var that = this;
                    covered.map(function(i, tile) {
                        that.cascade_reveal($(tile)); // recursively cascade_reveal covered unflagged neighbors
                    });
                }
                else {
                    $tile.not('.flag').html($('<span>').attr('class', 'minecount' + count).text(count)).addClass('count');
                }
            },

            // Handles cheat option selected.
            // Reveals mines.
            cheat: function(e) {
                $(this).addClass('cheating');
                _.each(e.data._mine_locations, function(id) {
                    var $tile = $('#'+id);
                    $tile.removeClass('flag').removeClass('guess');
                    $tile.addClass('reveal_mine');
                });
            },
            // Handles cheat option deselected.
            // Unreveals mines and returns tiles to their previous state (flag / guess).
            uncheat: function(e) {
                $(this).removeClass('cheating');
                _.each(e.data._mine_locations, function(id) {
                    var $tile = $('#'+id);
                    $tile.removeClass('reveal_mine');
                    if($tile.data() && $tile.data().hasFlag) {
                        $tile.addClass('flag');
                    }
                    if($tile.data() && $tile.data().hasGuess) {
                        $tile.addClass('guess');
                    }
                });
            },

            // Checks if the game has been won.
            // Can be manually invoked by planting all flags and clicking the smiley to validate.
            // Is automatically invoked when a flag is planted or a tile is reveled through a click.
            check_win: function(validate) {
                var validate = validate || false;
                if(validate) {
                    if(this._unplanted_flags == 0) {
                        var win = true;
                        $('.tile.flag').each(function(i, tile) {
                            if(!$(tile).data().hasMine) {
                                win = false;
                                return false;
                            }
                        });
                        return win;
                    }
                }
                else if(this._tiles == this._MINES) {
                    return true;
                }
                return false;
            }
        }

        Game.init(); // run the game on pageload.
    });

})(jQuery); // needs jQuery
