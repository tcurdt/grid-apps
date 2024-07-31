/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: moto.broker
// dep: mesh.util
// dep: mesh.api
gapp.register("mesh.build", [], (root, exports) => {

const { broker } = gapp;
const { base, mesh, moto } = root;
const { api, util } = mesh;
const { space } = moto;
const { bind, div, label, input, hr } = h;

const devel = api.isDebug;

let call = broker.send;
let rad = 180 / Math.PI;
let und = undefined;

broker.listeners({
    ui_build
});

let spin_timer;

// add download / blob export to util
util.download = (data, filename = "mesh-data") => {
    let url = window.URL.createObjectURL(new Blob([data], {type: "octet/stream"}));
    $('download').innerHTML = `<a id="_data_export_" href="${url}" download="${filename}">x</a>`;
    $('_data_export_').click();
};

// add modal dialog functions to api
const modal = api.modal = {
    show(title, contents) {
        if (this.info.showing) {
            throw `modal conflict showing "${title}"`;
        }
        let bound = bind($('modal'), contents);
        $('modal_title_text').innerText = title;
        $('modal_page').style.display = 'flex';
        $('modal_frame').style.display = 'flex';
        $('spinner').style.display = 'none';
        modal.info = { title, contents, showing: true };
        broker.publish('modal_show');
        return bound;
    },

    hide(cancel = false) {
        if (!modal.info.showing) {
            return;
        }
        clearTimeout(spin_timer);
        $('modal_page').style.display = 'none';
        modal.info.showing = false;
        modal.info.cancelled = cancel;
        broker.publish('modal_hide');
        if (modal._dialog) {
            modal._dialog.resolve(modal._dialog.bound);
            modal._dialog = undefined;
        }
    },

    cancel() {
        // hide but set a flag denoting cancellation
        modal.hide(true);
    },

    info: {
        showing: false
    },

    get title() {
        return modal.info.title;
    },

    get showing() {
        return modal.info.showing;
    },

    spin(bool, delay) {
        if (bool) {
            if (delay) {
                spin_timer = setTimeout(() => {
                    modal.spin(true);
                }, delay);
                return;
            }
            $('modal_page').style.display = 'flex';
            $('modal_frame').style.display = 'none';
            $('spinner').style.display = 'block';
            broker.publish('modal_show', 'spinner');
        } else {
            modal.hide();
        }
    },

    dialog(opt = {}) {
        let { title, body } = opt;
        let contents = [];
        if (typeof body === 'string') {
            contents.push(div(body))
        } else if (Array.isArray(body)) {
            contents.appendAll(body);
        } else {
            throw "invalid dialog contents";
        }
        return new Promise((resolve, reject) => {
            let bound = this.show(title, contents);
            modal._dialog = { resolve, reject, bound };
        });
    },

    get bound() {
        return modal._dialog ? modal._dialog.bound : undefined;
    }
};

let pinner;
// transient logging window bottom/left
const log = api.log = {
    age: 600000, // age out lines more than 10 minutes old

    data: [],   // last n messages

    wait: 3000, // time before windows closes

    lines: 20,  // max log lines before forced-age out

    emit() {
        let { age, data, lines, render } = log;
        let now = Date.now();
        data.push({
            text: `${dbug.since()} | ${[...arguments].join(' ')}`,
            time: now
        });
        if (api.isDebug) {
            console.log(data.peek().text);
        }
        while (!log.pinned && data.length && (data.length > lines || now - data[0].time > age)) {
            data.shift();
        }
        return render();
    },

    hide() {
        $('logger').style.display = 'none';
        return log;
    },

    toggle(opt) {
        return log.pinned ? log.unpin() && log.hide() : log.pin(opt);
    },

    pin(opt = { spinner: 100 }) {
        log.pinned = true;
        if (opt.spinner > 0) {
            clearTimeout(pinner);
            pinner = setTimeout(() => {
                $('pinner').style.display = 'inline-block';
            }, opt.spinner);
        }
        return log.show();
    },

    unpin() {
        log.pinned = false;
        clearTimeout(pinner);
        $('pinner').style.display = 'none';
        return log.show();
    },

    // show log window for `time` milliseconds or default
    show(time) {
        clearTimeout(log.timer);
        log.timer = log.pinned ? null : setTimeout(log.hide, time || log.wait);
        $('logger').style.display = 'flex';
        return log;
    },

    // re-render and show current log messages
    render() {
        let area = $('logtext');
        bind(area, log.data.map(rec => div({ _: rec.text })));
        area.scrollTop = area.scrollHeight;
        return log.show();
    },
};

// bind endpoint for worker to log in the ui
gapp.broker.subscribe("mesh.log", msg => {
    log.emit(msg);
});

// welcome dialog
api.welcome = function(version = "unknown") {
    const { prefs } = api;
    const { map } = prefs;
    modal.show('About Mesh:Tool', div({ class:"welcome" }, [
        h.a({
            target: "docs",
            _: "Guide & Documentation",
            href: "https://docs.grid.space/projects/mesh-tool"
        }),
        h.a({
            target: "docs",
            _: "Grid.Space",
            href: "https://grid.space/"
        }),
        div(`Version: ${version}`),
        hr({ width: "100%" }),
        div({ class: "choice" }, [
            input({
                type: "checkbox",
                [ map.info.welcome !== false ? 'checked' : 'unchecked' ] : 1,
                onchange: (ev) => {
                    map.info.welcome = ev.target.checked;
                    prefs.save();
                }
            }),
            div("show at startup")
        ]),
    ]));
};

// bind settings endpoint to api
api.settings = function() {
    const { util } = mesh;
    const { prefs } = api;
    const { surface, normals, space, sketch, wireframe } = prefs.map;
    const { dark } = space;

    const set1 = div([
        label('dark mode'),
        input({ type: "checkbox",
            onchange: ev => call.set_darkmode(ev.target.checked),
            [ dark ? 'checked' : 'unchecked' ] : 1
        }),
        label('auto floor'),
        input({ type: "checkbox",
            onchange: ev => prefs.save( space.floor = !space.floor ),
            [ space.floor !== false ? 'checked' : 'unchecked' ] : 1
        }),
        label('auto center'),
        input({ type: "checkbox",
            onchange: ev => prefs.save( space.center = !space.center ),
            [ space.center !== false ? 'checked' : 'unchecked' ] : 1
        }),
    ]);

    const set2 = div([
        label({ class: "header", _: 'wire'}),
        label('opacity'),
        input({ type: "text", size: 5, value: parseFloat(wireframe.opacity),
            onchange: ev => call.set_wireframe_opacity(ev.target.value)
        }),
        label('fog x'),
        input({ type: "text", size: 5, value: parseFloat(wireframe.fog),
            onchange: ev => call.set_wireframe_fog(ev.target.value)
        }),
    ]);

    const set3 = div([
        label({ class: "header", _: 'normal'}),
        label('length'),
        input({ type: "text", size: 6, value: parseFloat(normals.length),
            onchange: ev => call.set_normals_length(ev.target.value)
        }),
        label('color'),
        input({ type: "text", size: 6,
            value: util.toHexRGB(dark ? normals.color_dark : normals.color_lite),
            onchange: ev => call.set_normals_color(util.fromHexRGB(ev.target.value))
        }),
    ]);

    const set4 = div([
        label({ class: "header", _: 'surface'}),
        label('radians'),
        input({ type: "text", size: 5, value: parseFloat(surface.radians),
            onchange: ev => call.set_surface_radians(ev.target.value)
        }),
        label('radius'),
        input({ type: "text", size: 5, value: parseFloat(surface.radius || 0.2),
            onchange: ev => call.set_surface_radius(ev.target.value)
        }),
    ]);

    const set5 = div([
        label({ class: "header", _: 'snap'}),
        label('value'),
        input({ type: "text", size: 5, value: parseFloat(space.snap || 1),
            onchange: ev => call.set_snap_value(ev.target.value)
        }),
        label('enabled'),
        input({ type: "checkbox",
            onchange: ev => prefs.save( space.snapon = !space.snapon ),
            [ space.snapon === true ? 'checked' : 'unchecked' ] : 1
        }),
    ]);

    const set6 = div([
        label({ class: "header", _: 'duplicate'}),
        label('select'),
        input({ type: "checkbox",
            onchange: ev => prefs.save( space.dup_sel = !space.dup_sel ),
            [ space.dup_sel === true ? 'checked' : 'unchecked' ] : 1
        }),
        label('shift'),
        input({ type: "checkbox",
            onchange: ev => prefs.save( space.dup_shift = !space.dup_shift ),
            [ space.dup_shift === true ? 'checked' : 'unchecked' ] : 1
        }),
    ]);

    let ot = sketch.open_type;
    let srr = () => { api.sketch.list().forEach(s => s.render()) };
    const set7 = div([
        label({ class: "header", _: 'open poly'}),
        label('auto close'),
        input({ type: "checkbox",
            onchange: ev => prefs.save( ((sketch.open_close = !sketch.open_close) || true) && srr() ),
            [ sketch.open_close === true ? 'checked' : 'unchecked' ] : 1
        }),
        label('width'),
        input({ type: "text", size: 5, value: parseFloat(sketch.open_width || 1),
            onchange: ev => prefs.save( (sketch.open_width = parseFloat(ev.target.value)) && srr() )
        }),
        label('type'),
        h.select({ type: "text", value: sketch.open_type,
            onchange: ev => prefs.save( (sketch.open_type = ev.target.value) && srr() )
        }, [
            h.option({ _: 'square', [ot === 'square' ? 'selected' : '']: '' }),
            h.option({ _: 'miter', [ot === 'miter' ? 'selected' : '']: '' }),
            h.option({ _: 'round', [ot === 'round' ? 'selected' : '']: ''}),
        ]),
    ]);

    modal.show('settings', div({ class: "settings" }, [
        set1, set2, set3, set4, set5, set6, set7
    ] ));
}

// bootstrap icons
function bicon(name) {
    return h.i({ class: [ "bi", name ] });
}

// fontawesome icons
function facon(name, sub) {
    return h.i({ class: [ sub || "fa", name ] });
}

function menu_item(text, fn, short) {
    if (short) {
        short = Array.isArray(short) ? short : [ short ];
        short = div({ class: "short" }, short.map(s => s.startsWith('bi-') ?
            bicon(s) : div(s)
        ));
    }
    return div({ onclick: fn }, [
        div({ _: text, class: "grow" }),
        short
    ].filter(o => o));
}

// create html elements
function ui_build() {
    let { file, selection, mode, tool, sketch, prefs, add } = api;
    let trash = FontAwesome.icon({ prefix: "fas", iconName: "trash" }).html[0];
    let eye_open = FontAwesome.icon({ prefix: "fas", iconName: "eye" }).html[0];
    let eye_closed = FontAwesome.icon({ prefix: "fas", iconName: "eye-slash" }).html[0];

    // top left drop menus
    bind($('top-left'), [
        div({ class: "menu" }, [
            div('File'),
            div({ class: "menu-items" }, [
                input({
                    id: "import", type: "file", class: ["hide"], multiple: true,
                    onchange(evt) { broker.send.load_files(evt.target.files) }
                }),
                menu_item('Import', file.import, 'I'),
                menu_item('Export', file.export, 'X'),
                hr(),
                menu_item('Slicer', api.kirimoto),
                hr(),
                menu_item('Close', window.close),
            ])
        ]),
        div({ class: "menu sketch-on" }, [
            div('Edit'),
            div({ class: "menu-items" }, [
                menu_item('Add Circle', api.add.circle),
                menu_item('Add Rectangle', api.add.rectangle),
                hr(),
                menu_item('Add Sketch', add.sketch),
                hr(),
                menu_item('Delete', api.selection.delete, 'bi-backspace'),
            ])
        ]),
        div({ class: "menu sketch-off" }, [
            div('Edit'),
            div({ class: "menu-items" }, [
                menu_item('Add Cylinder', add.cylinder),
                menu_item('Add Cube', add.cube),
                menu_item('Add Gear', add.gear),
                hr(),
                menu_item('Add Sketch', add.sketch),
                devel ? menu_item('Add Vertices', add.input) : undefined,
                hr(),
                menu_item('Delete', api.selection.delete, 'bi-backspace'),
            ])
        ]),
        div({ class: "menu" }, [
            div('View'),
            div({ class: "menu-items" }, [
                menu_item('Bounds', () => { selection.boundsBox({ toggle: true }) }, 'B'),
                menu_item('Normals', () => { api.normals() }, 'N'),
                menu_item('Wireframes', () => { api.wireframe() }, 'W'),
                hr(),
                menu_item('Gridlines', () => { api.grid() }, 'G'),
                menu_item('Messages', () => { api.log.toggle({ spinner: false }) }, 'L'),
                hr(),
                menu_item('Home', space.view.home, 'H'),
                menu_item('Top', space.view.top, 'T'),
                menu_item('Reset', space.view.reset, 'Z'),
            ])
        ]),
        div({ class: "menu" }, [
            div('Mode'),
            div({ class: "menu-items" }, [
                div({ _: 'Sketch', id: "mode-sketch", onclick: mode.sketch }),
                hr(),
                div({ _: 'Object', id: "mode-object", onclick: mode.object }),
                div({ _: 'Tool', id: "mode-tool", onclick: mode.tool }),
                hr(),
                div({ _: 'Surface', id: "mode-surface", onclick: mode.surface }),
                div({ _: 'Face', id: "mode-face", onclick: mode.face }),
                div({ _: 'Edge', id: "mode-edge", onclick: mode.edge }),
            ])
        ]),
        div({ class: "menu sketch-on" }, [
            div('Object'),
            div({ class: "menu-items" }, [
                menu_item('Group', sketch.arrange.group),
                menu_item('Ungroup', sketch.arrange.ungroup),
                hr(),
                menu_item('Center', sketch.arrange.center),
                menu_item('Rotate', sketch.arrange.rotate),
                hr(),
                menu_item('Flip Horizontal', sketch.arrange.fliph),
                menu_item('Flip Vertical', sketch.arrange.flipv),
                hr(),
                menu_item('Raise', sketch.arrange.up),
                menu_item('Lower', sketch.arrange.down),
                menu_item('To Top', sketch.arrange.top),
                menu_item('To Bottom', sketch.arrange.bottom),
            ])
        ]),
        div({ class: "menu sketch-off" }, [
            div('Object'),
            div({ class: "menu-items" }, [
                menu_item('Regroup', tool.regroup),
                menu_item('Isolate', tool.isolate),
                hr(),
                menu_item('Duplicate', tool.duplicate, ['bi-shift','D']),
                menu_item('Mirror', tool.mirror, 'M'),
                menu_item('Merge', tool.merge),
                menu_item('Split', mesh.split.start, 'S'),
                hr(),
                menu_item('Union', tool.union),
                menu_item('Subtract', tool.subtract),
                menu_item('Intersect', tool.intersect),
                menu_item('Difference', tool.difference),
                hr(),
                menu_item('Copy Circle', api.pattern.circle),
                menu_item('Copy Grid', api.pattern.grid),
            ])
        ]),
        div({ class: "menu sketch-off" }, [
            div('Faces'),
            div({ class: "menu-items" }, [
                menu_item('Flip Normals', tool.invert),
                menu_item('Analyze', tool.analyze),
                // div({ _: 'Patch', onclick: tool.repair }),
                // div({ _: 'rebuild', onclick: tool.rebuild }),
                menu_item('Clean', tool.clean),
            ])
        ]),
        div({ class: "menu sketch-on" }, [
            div('Shape'),
            div({ class: "menu-items" }, [
                menu_item('Duplicate', tool.duplicate, ['bi-shift','D']),
                menu_item('Extrude', () => sketch.extrude(), ['bi-shift','E']),
                hr(),
                menu_item('Union', sketch.boolean.union),
                menu_item('Intersect', sketch.boolean.intersect),
                menu_item('Difference', sketch.boolean.difference),
                hr(),
                menu_item('Nest', sketch.boolean.nest),
                menu_item('Flatten', sketch.boolean.flatten),
                menu_item('Even Odd', sketch.boolean.evenodd),
            ])
        ]),
        div({ class: "menu" }, [
            div('Help'),
            div({ class: "menu-items" }, [
                menu_item('About', () => { api.welcome(mesh.version) }),
                hr(),
                menu_item('Documentation', api.help),
                menu_item('Official Site', api.gridspace),
                menu_item('Donate', api.donate),
                hr(),
                menu_item('Versions', api.version),
            ])
        ]),
    ]);

    // add help buttons
    bind($('top-right'), [
        div({ id: "top-settings", onclick: api.settings }, [
            div({ class: "fas fa-gear" }),
            div('Settings')
        ]),
    ]);

    // modal dialog and page blocker
    bind($('modal_page'), [
        div({ id: 'modal_frame' }, [
            div({ id: 'modal_title'}, [
                div({ id: 'modal_title_text', _: 'title' }),
                div({ id: 'modal_title_close', onclick: modal.cancel }, [
                    h.i({ class: "far fa-window-close" })
                ])
            ]),
            div({ id: 'modal' }, [
                div({ _: 'this is a modal test' })
            ])
        ]),
        div({ id: 'spinner', class: 'spin' })
    ]);

    // create top level app areas
    let bound = bind($('app-body'), [
        // display and action areas
        div({ id: 'tools' }, [
            div({ id: 'sketchtools', class: "tools sketch-on" }),
            div({ id: 'objecttools', class: "tools sketch-off" }),
            div({ id: 'logger', onmouseover() { log.show() } }),
        ]),
        div({ id: 'grouplist' }),
        div({ id: 'selectlist' }),
        div({ id: 'download', class: "hide" })
    ]);

    let { sketchtools, grouplist, selectlist, logger } = bound;

    function tool_item(icon, help, fn) {
        return div({ onclick: fn, class: "tool" }, [ bicon(icon), div([ label(help) ]) ]);
    }

    // bind sketch chiclets
    bind(sketchtools, div([
        tool_item('bi-plus', 'New Sketch', add.sketch),
        tool_item('bi-circle', 'Add Circle', api.add.circle),
        tool_item('bi-square', 'Add Rectangle', api.add.rectangle),
        tool_item('bi-symmetry-vertical', 'Offset', api.sketch.arrange.fliph),
        tool_item('bi-symmetry-horizontal', 'Offset', api.sketch.arrange.flipv),
        tool_item('bi-arrow-clockwise', 'Offset', api.sketch.arrange.rotate),
        tool_item('bi-union', 'Union', sketch.boolean.union),
        tool_item('bi-intersect', 'Intersect', sketch.boolean.intersect),
        tool_item('bi-exclude', 'Difference', sketch.boolean.difference),
        tool_item('bi-pip', 'Nest', sketch.boolean.nest),
        tool_item('bi-layers', 'Flatten', sketch.boolean.flatten),
        tool_item('bi-cookie', 'Even Odd', sketch.boolean.evenodd),
        tool_item('bi-arrow-bar-up', 'Extrude', () => sketch.extrude()),
]));

    // bind object chiclets
    bind(objecttools, div([
        tool_item('bi-pencil', 'New Sketch', add.sketch),
        tool_item('bi-box', 'New Cube', add.cube),
        tool_item('bi-database', 'New Cylinder', add.cylinder),
        tool_item('bi-gear', 'New Gear', add.gear),
        tool_item('bi-union', 'Union', tool.union),
        tool_item('bi-subtract', 'Subtract', tool.subtract),
        tool_item('bi-intersect', 'Intersect', tool.intersect),
        tool_item('bi-exclude', 'Difference', tool.difference),
]));

    // create slid in/out logging window
    bind(logger, [ div({ id: 'logtext' }) ]);

    // for group/model/box/area/mesh dashboard grids
    function grid(v1, v2, side = [ "pos", "rot"], top = [ "X", "Y", "Z" ], root) {
        let v = 'val', l = 'lbl';
        let [ X, Y, Z ] = top;
        let [ pos, rot ] = side;
        return div({ class: "grid"}, [
            div({ _: "" }),
            div({ _: X, class: "top noselect", id: root ? [ root, l, X ] : und }),
            div({ _: Y, class: "top noselect", id: root ? [ root, l, Y ] : und }),
            div({ _: Z, class: "top noselect", id: root ? [ root, l, Z ] : und }),
            div({ _: side[0], class: "side noselect" }),
            label({ _: v1[0], id: root ? [ root, v, X, pos ] : und }),
            label({ _: v1[1], id: root ? [ root, v, Y, pos ] : und }),
            label({ _: v1[2], id: root ? [ root, v, Z, pos ] : und }),
            div({ _: side[1], class: "side noselect" }),
            label({ _: v2[0], id: root ? [ root, v, X, rot ] : und }),
            label({ _: v2[1], id: root ? [ root, v, Y, rot ] : und }),
            label({ _: v2[2], id: root ? [ root, v, Z, rot ] : und }),
        ]);
    }

    // for dashboard sketch grids
    function grid2(v1, v2, side = [ "pos", "rot"], top = [ "X", "Y" ], root) {
        let v = 'val', l = 'lbl';
        let [ X, Y ] = top;
        let [ pos, rot ] = side;
        return div({ class: "grid grid2"}, [
            div({ _: "" }),
            div({ _: X, class: "top noselect", id: root ? [ root, l, X ] : und }),
            div({ _: Y, class: "top noselect", id: root ? [ root, l, Y ] : und }),
            div({ _: side[0], class: "side noselect" }),
            label({ _: v1[0], id: root ? [ root, v, X, pos ] : und }),
            label({ _: v1[1], id: root ? [ root, v, Y, pos ] : und }),
            div({ _: side[1], class: "side noselect" }),
            label({ _: v2[0], id: root ? [ root, v, X, rot ] : und }),
            label({ _: v2[1], id: root ? [ root, v, Y, rot ] : und }),
        ]);
    }

    // for other dashboard grids
    function grid1(vals, side = [ "X", "Y"], top = "center", root, post) {
        let v = 'val', l = 'lbl';
        let [ X, Y ] = side;
        return div({ class: "grid grid1"}, [
            div({ _: "" }),
            div({ _: top, class: "top noselect", id: root ? [ root, l ] : und }),
            div({ _: side[0], class: "side noselect" }),
            label({ _: vals[0], id: root ? [ root, v, X, post ] : und }),
            div({ _: side[1], class: "side noselect" }),
            label({ _: vals[1], id: root ? [ root, v, Y, post ] : und }),
        ]);
    }

    function update_all() {
        update_selector();
        update_selection();
    }

    // update model selector list (top/right)
    function update_selector() {
        let selHas = selection.contains;
        // map groups to divs
        let groups = api.group.list()
            .map(g => div([
                h.button({ _: g.name || `group`, title: g.id,
                    class: [ "group", selHas(g) ? 'selected' : undefined ],
                    onclick(e) {
                        api.mode.object();
                        selection.toggle(g);
                    }
                }),
                div({ class: "models"},
                    // map models to buttons
                    g.models.map(m => [
                        h.button({ _: m.file || m.id,
                            class: [ selHas(m) ? 'selected' : undefined ],
                            onclick(e) {
                                if (e.shiftKey) {
                                    tool.rename([ m ]);
                                } else {
                                    if (!api.mode.is([ api.modes.object, api.modes.tool ])) {
                                        api.mode.object();
                                    }
                                    selection.toggle(m);
                                }
                            },
                            onmouseover(e) {
                                m.highlight();
                            },
                            onmouseleave(e) {
                                m.unhighlight();
                            }
                        }),
                        h.button({
                            class: [ 'square' ],
                            onclick(e) {
                                m.visible({ toggle: true });
                                update_selector();
                            }
                        }, [ h.raw(m.visible() ? eye_open : eye_closed) ])
                    ])
                )
            ]));
        let sketches = api.sketch.list();
        if (sketches.length) {
            let sg = div([
                h.button({ _: 'sketch',
                    class: [ "group" ],
                }),
                sketches.map(sketch => div({ class: "models"}, [
                    h.button({ _: sketch.file || sketch.id,
                        class: [ selHas(sketch) ? 'selected' : undefined ],
                        onclick(e) {
                            if (e.shiftKey) {
                                tool.rename([ sketch ], 'sketch');
                            } else {
                                selection.toggle(sketch);
                            }
                        },
                        onmouseover(e) {
                            sketch.highlight();
                        },
                        onmouseleave(e) {
                            sketch.unhighlight();
                        }
                    }),
                    h.button({
                        class: [ 'square' ],
                        onclick(e) {
                            sketch.visible({ toggle: true });
                            update_selector();
                        }
                    }, [
                        h.raw(sketch.visible() ? eye_open : eye_closed)
                    ])
                ]))
            ]);
            groups.push(sg);
        }
        bind(grouplist, groups);
    }

    // return function bound to field editing clicks
    // builds a modal dialog that updates the object and field
    function field_edit(title, set, opt = {}) {
        return function(ev) {
            let floor = api.prefs.map.space.floor !== false;
            let value = ev.target.innerText;
            let onclick = (ev) => {
                let tempval = parseFloat($('tempval').value);
                api.modal.hide(modal.info.cancelled);
                if (modal.info.cancelled) {
                    return;
                }
                if (opt.sketch) {
                    defer_selection();
                    return set(tempval, value);
                }
                for (let g of api.selection.groups()) {
                    set(g, tempval, value);
                    if (floor && opt.floor !== false) {
                        g.floor(mesh.group);
                    }
                }
                defer_selection();
            };
            let onkeydown = (ev) => {
                if (ev.key === 'Enter') {
                    estop(ev);
                    onclick();
                }
            };
            let { tempval } = api.modal.show(title, div({ class: "tempedit" }, [
                input({ id: 'tempval', value, size: 10, onkeydown }),
                h.button({ _: 'set', onclick })
            ]));
            tempval.setSelectionRange(0, tempval.value.length);
            tempval.focus();
        }
    }

    // editable model/sketch information dashboard
    function update_selection() {
        let map = { fixed: 2 };

        // toggle-able stat block generator
        let sdata = {};
        function sblock(label, title, grid) {
            let map = sdata[label] = {
                hide: `${label}_hide`,
                show: `${label}_show`,
                data: `${label}_data`
            };
            return [
                h.button({ id: map.show, class: "side" }, [ div(label)] ),
                div({ id: map.data }, [
                    h.button({ id: map.hide, _: label, title }),
                    grid
                ])
            ];
        }

        // possible selections
        let sketch = selection.sketch();
        let s_grp = selection.groups(true);
        let s_mdl = selection.models(true);

        if (!(sketch || s_grp.length)) {
            return bind(selectlist, []);
        }

        // render sketch options
        if (sketch) {
            let bounds = {
                size: sketch.scale,
                center: sketch.center
            };
            let sel = sketch.selection.mesh_items();
            let sk_vars = sblock('sketch', sketch.file || sketch.id, grid(
                util.extract(bounds.center, map),
                util.extract(bounds.size, map),
                [ "center", "scale" ], und, 'sketch'
            ));
            let sel_item;
            let sel_size;
            let sel_sobj;
            let si_vars = sel.length > 1 ? [] : sel.slice(0,1).map(sel => {
                let { sketch_item } = sel;
                let { item } = sketch_item;
                sel_item = item;
                sel_sobj = sketch_item;
                if (item.type === 'polygon') {
                    let { bounds } = sketch_item.poly;
                    sel_size = { x: bounds.width(), y: bounds.height() };
                    return sblock('polygon', '', grid2(
                        util.extract(item.center, map),
                        [ sel_size.x.toFixed(2), sel_size.y.toFixed(2) ],
                        [ "center", "size" ], und, 'item'
                    ));
                } else if (item.type === 'circle') {
                    return [
                        sblock('circle', '', grid1(
                            [ item.points || sel_sobj.poly.length, item.rotation || 0 ],
                            [ "points", "rotation" ], "Value", 'circle', 'other'
                        )),
                        sblock('circle', '', grid2(
                            util.extract(item.center, map),
                            [ (item.radius*2).toFixed(2), (item.radius*2).toFixed(2) ],
                            [ "center", "size" ], und, 'item'
                        )),
                    ];
                }
            });
            let bound = bind(selectlist, [
                ...si_vars,
                ...sk_vars
            ]);
            for (let axis of [ 'x', 'y', 'z' ]) {
                let el = bound[`sketch_val_${axis.toUpperCase()}_center`];
                el.classList.add('editable');
                el.onclick = field_edit(`${axis} center`, (nval, oval) => {
                    sketch.center[axis] = nval;
                    sketch.render();
                }, { sketch: true });
                let el2 = bound[`sketch_val_${axis.toUpperCase()}_scale`];
                el2.classList.add('editable');
                el2.onclick = field_edit(`${axis} size`, (nval, oval) => {
                    sketch.scale[axis] = nval;
                    sketch.render();
                }, { sketch: true });
            }
            if (sel_item)
            for (let axis of [ 'x', 'y' ]) {
                let el = bound[`item_val_${axis.toUpperCase()}_center`];
                // all items have centers
                if (!el) continue;
                el.classList.add('editable');
                el.onclick = field_edit(`${axis} center`, (nval, oval) => {
                    sel_item.center[axis] = nval;
                    sketch.render();
                }, { sketch: true });
                // polygon scaling, circle radius
                let el2 = bound[`item_val_${axis.toUpperCase()}_size`];
                if (!el2) continue;
                el2.classList.add('editable');
                el2.onclick = field_edit(`${axis} size`, (nval, oval) => {
                    if (sel_item.type === 'polygon') {
                        let scale = {x:1,y:1,z:1};
                        let poly = base.newPolygon().fromObject(sel_item);
                        let bounds = poly.bounds;
                        scale[axis] = nval/oval;
                        poly.move(bounds.center().scale(-1,-1,-1));
                        poly.scale(scale);
                        poly.move(bounds.center());
                        Object.assign(sel_item, poly.toObject());
                    } else if (sel_item.type === 'circle') {
                        sel_item.radius = nval / 2;
                    }
                    sketch.render();
                }, { sketch: true });
                // circle points / rotation
                let lab = { x: 'points', y: 'rotation' }[axis];
                let el3 = bound[`circle_val_${lab}_other`];
                if (!el3) continue;
                el3.classList.add('editable');
                el3.onclick = field_edit(`${axis} size`, (nval, oval) => {
                    sel_item[lab] = nval;
                    sketch.render();
                }, { sketch: true });
            }

            return;
        }

        // map selection to divs
        let g_pos = util.average(s_grp.map(g => g.object.position));
        let g_rot = util.average(s_grp.map(g => g.object.rotation));
        let g_id = s_grp.map(g => g.id).join(' ');
        let h_grp = sblock('orient', g_id, grid(
            util.extract(g_pos, map),
            util.extract(g_rot).map(r => (r * rad).round(2).toFixed(map.fixed)),
            und, und, 'group'
        ));

        // let m_pos = util.average(s_mdl.map(m => m.object.position));
        // let m_rot = util.average(s_mdl.map(m => m.object.rotation));
        let m_id = s_mdl.map(m => m.id).join(' ');

        let bounds = util.bounds(s_mdl);
        let h_ara = sblock('span', m_id, grid(
            util.extract(bounds.center, map),
            util.extract(bounds.size, map),
            [ "center", "size" ], und, 'span'
        ));

        let t_vert = s_mdl.map(m => m.vertices).reduce((a,v) => a+v);
        let t_face = s_mdl.map(m => m.faces).reduce((a,v) => a+v);
        let h_msh = [div([
            h.button({ _: `mesh` }),
            div({ class: ["grid","grid1"]}, [
                div({ _: "" }),
                div({ _: "count", class: "top" }),
                div({ _: "vertex", class: "side" }),
                label({ _: util.comma(t_vert) }),
                div({ _: "face", class: "side" }),
                label({ _: util.comma(t_face) }),
            ])
        ])];

        let m_viz = !s_mdl.map(m => !m.visible()).reduce((v,b) => v || b);
        let h_ops = [div([
            h.button({ _: `ops` }),
            div({ class: ["grid","grid0"]}, [
                div({ class: [ 'square' ],
                    onclick(e) {
                        api.selection.visible(!m_viz);
                        update_selector();
                    }
                }, [ h.raw(m_viz ? eye_open : eye_closed) ]),
                div({ class: [ 'square' ],
                    onclick(e) { api.selection.delete() }
                }, [ h.raw(trash) ])
            ])
        ])];

        // bind elements to selectlist div
        let bound = bind(selectlist, [
            ...h_grp,
            ...h_ara,
            ...h_msh,
            ...h_ops
        ]);

        // bind rotation editable fields
        let { group_val_X_rot, group_val_Y_rot, group_val_Z_rot } = bound;
        [ group_val_X_rot, group_val_Y_rot, group_val_Z_rot ].forEach(e => {
            e.classList.add('editable');
        });
        group_val_X_rot.onclick = field_edit('x rotation', (group, val) => {
            let r = group.rotation();
            group.rotation(val/rad, r.y, r.z);
        });
        group_val_Y_rot.onclick = field_edit('y rotation', (group, val) => {
            let r = group.rotation();
            group.rotation(r.x, val/rad, r.z);
        });
        group_val_Z_rot.onclick = field_edit('z rotation', (group, val) => {
            let r = group.rotation();
            group.rotation(r.x, r.y, val/rad);
        });

        // bind position editable fields
        let { group_val_X_pos, group_val_Y_pos, group_val_Z_pos } = bound;
        [ group_val_X_pos, group_val_Y_pos, group_val_Z_pos ].forEach(e => {
            e.classList.add('editable');
        });
        group_val_X_pos.onclick = field_edit('x position', (group, val) => {
            let r = group.position();
            group.position(val, r.y, r.z);
        }, { floor: false });
        group_val_Y_pos.onclick = field_edit('y position', (group, val) => {
            let r = group.position();
            group.position(r.x, val, r.z);
        }, { floor: false });
        group_val_Z_pos.onclick = field_edit('z position', (group, val) => {
            let r = group.position();
            group.position(r.x, r.y, val);
        }, { floor: false });

        // bind scale editable fields
        let pedit = prefs.map.edit;
        let { span_val_X_size, span_val_Y_size, span_val_Z_size } = bound;
        [ span_val_X_size, span_val_Y_size, span_val_Z_size ].forEach(e => {
            e.classList.add('editable');
        });
        let axgrp = {};
        // activate axis grouping toggles
        [ "X", "Y", "Z" ].forEach(axis => {
            let prefkey = `scale_group_${axis}`;
            let agv = axgrp[axis] = pedit[prefkey];
            let lbl = bound[`span_lbl_${axis}`];
            lbl.classList.add('editable');
            if (agv) {
                lbl.classList.add('grouped');
            } else {
                bound[`span_lbl_${axis}`].classList.add('ungrouped');
            }
            lbl.onclick = () => {
                pedit[prefkey] = !agv;
                defer_selection(); // update ui
            };
        });
        span_val_X_size.onclick = field_edit('x size', (group, val, oval) => {
            let rel = val / parseFloat(oval);
            if (axgrp.X) {
                group.scale(rel, axgrp.Y ? rel : 1, axgrp.Z ? rel : 1);
            } else {
                group.scale(rel, 1, 1);
            }
        });
        span_val_Y_size.onclick = field_edit('y size', (group, val, oval) => {
            let rel = val / parseFloat(oval);
            if (axgrp.Y) {
                group.scale(axgrp.X ? rel : 1, rel, axgrp.Z ? rel : 1);
            } else {
                group.scale(1, rel, 1);
            }
        });
        span_val_Z_size.onclick = field_edit('z size', (group, val, oval) => {
            let rel = val / parseFloat(oval);
            if (axgrp.Z) {
                group.scale(axgrp.X ? rel : 1, axgrp.Y ? rel : 1, rel);
            } else {
                group.scale(1, 1, rel);
            }
        });

        let pmap = prefs.map.info;
        // map buttons to show/hide selection info
        function toggle(label, h, s, d) {
            s.onclick = () => {
                s.style.display = 'none';
                d.style.display = 'flex';
                prefs.save( pmap[label] = 'show' ); // <- :)
            };
            h.onclick = () => {
                d.style.display = 'none';
                s.style.display = 'flex';
                prefs.save( pmap[label] = 'hide' );
            };
            if (pmap[label] === 'show') {
                s.onclick();
            } else {
                h.onclick();
            }
        }
        for (let [label, map] of Object.entries(sdata)) {
            let { data, hide, show } = map;
            toggle(label, bound[hide], bound[show], bound[data]);
        }
    }

    // listen for api calls
    // create a deferred wrapper to merge multiple rapid events
    let defer_all = util.deferWrap(update_all);
    let defer_selector = util.deferWrap(update_selector);
    let defer_selection = util.deferWrap(update_selection);

    broker.listeners({
        model_add: defer_all,
        group_add: defer_all,
        model_remove: defer_all,
        group_remove: defer_all,
        selection_update: defer_all,
        selection_drag: defer_selection,
        selection_move: defer_selection,
        selection_scale: defer_selection,
        selection_rotate: defer_selection,
        selection_qrotate: defer_selection,
        sketch_selections: defer_selection
    });
}

});
