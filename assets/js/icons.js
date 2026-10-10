const ATTR = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

function wrap(inner) { return '<svg ' + ATTR + '>' + inner + '</svg>'; }

export const ICONS = {
    log: wrap(
        '<rect x="3" y="5.5" width="11.5" height="14.5" rx="1.6"></rect>' +
        '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" ' +
        'transform="translate(9.2 1.2) scale(0.58)" vector-effect="non-scaling-stroke"></path>'
    ),

    mood: wrap(
        '<path d="M3 18h18"></path>' +
        '<path d="M6.5 18a5.5 5.5 0 0 1 11 0"></path>' +
        '<path d="M12 4.6v2.2M5.6 7.1l1.5 1.5M18.4 7.1l-1.5 1.5"></path>' +
        '<path d="M2.6 21.4h18.8"></path>'
    ),

    sleep: wrap(
        '<path d="M20.6 14.3A8.6 8.6 0 1 1 9.7 3.4a6.9 6.9 0 0 0 10.9 10.9z"></path>' +
        '<path d="M17.4 4.2v2.6M16.1 5.5h2.6"></path>'
    ),

    pain: wrap(
        '<path d="M2.4 12.4h3.4l2-5.4 3.1 9.6 2.3-6.6 1.6 2.4h6.8"></path>'
    ),

    exercise: wrap(
        '<circle cx="13.2" cy="4.4" r="1.9"></circle>' +
        '<path d="M12.4 8.2 9.1 10.6l1.5 3.6-1.9 5.4"></path>' +
        '<path d="M10.6 14.2 15 16l1.1 3.6"></path>' +
        '<path d="M12.4 8.2l4 1.5 2.2-1.4"></path>'
    ),

    diary: wrap(
        '<path d="M5 3.5h11.5a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5z"></path>' +
        '<path d="M5 3.5v17"></path>' +
        '<path d="M8.6 8h6.4M8.6 12h6.4M8.6 16h4"></path>'
    ),

    download: wrap(
        '<path d="M12 3.6v11"></path>' +
        '<path d="M7.6 10.4 12 14.8l4.4-4.4"></path>' +
        '<path d="M4.4 17.4v1.6a1.6 1.6 0 0 0 1.6 1.6h12a1.6 1.6 0 0 0 1.6-1.6v-1.6"></path>'
    ),

    mic: wrap(
        '<rect x="9.2" y="2.6" width="5.6" height="11" rx="2.8"></rect>' +
        '<path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0"></path>' +
        '<path d="M12 17.8v3.6M9 21.4h6"></path>'
    ),

    spark: wrap(
        '<path d="M12 3.2l1.5 4.4 4.4 1.5-4.4 1.5L12 15l-1.5-4.4L6.1 9.1l4.4-1.5z"></path>' +
        '<path d="M18.4 15.4l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"></path>'
    ),

    calendar: wrap(
        '<rect x="3.4" y="5" width="17.2" height="15.6" rx="2.6"></rect>' +
        '<path d="M3.4 9.6h17.2"></path>' +
        '<path d="M8.2 3v3.4M15.8 3v3.4"></path>' +
        '<path d="M7.6 13.4h2.2M14.2 13.4h2.2M7.6 17h2.2"></path>'
    ),

    pill: wrap(
        '<rect x="2.8" y="8.6" width="18.4" height="6.8" rx="3.4" ' +
        'transform="rotate(-45 12 12)"></rect>' +
        '<path d="M9.1 9.1l5.8 5.8" transform="rotate(0)"></path>'
    ),

    hospital: wrap(
        '<path d="M4.6 20.4V6.6a1.6 1.6 0 0 1 1.6-1.6h11.6a1.6 1.6 0 0 1 1.6 1.6v13.8"></path>' +
        '<path d="M3 20.4h18"></path>' +
        '<path d="M12 8.6v4.2M9.9 10.7h4.2"></path>' +
        '<path d="M9.6 20.4v-3.6h4.8v3.6"></path>'
    ),

    revisit: wrap(
        '<path d="M20.2 12a8.2 8.2 0 1 1-2.5-5.9"></path>' +
        '<polyline points="20.4 3.6 20.4 8 16 8"></polyline>' +
        '<path d="M12 8.4V12l2.6 1.6"></path>'
    ),

    checkup: wrap(
        '<rect x="5" y="4.4" width="14" height="16.2" rx="2"></rect>' +
        '<path d="M9 4.4V3.2h6v1.2"></path>' +
        '<polyline points="8.8 13.4 11 15.6 15.4 10.6"></polyline>'
    ),

    search: wrap(
        '<circle cx="11" cy="11" r="6.4"></circle>' +
        '<line x1="15.8" y1="15.8" x2="20.4" y2="20.4"></line>'
    ),

    plus: wrap(
        '<line x1="12" y1="4.6" x2="12" y2="19.4"></line>' +
        '<line x1="4.6" y1="12" x2="19.4" y2="12"></line>'
    ),

    clock: wrap(
        '<circle cx="12" cy="12" r="8.4"></circle>' +
        '<polyline points="12 7.2 12 12 15.6 14"></polyline>'
    ),

    trash: wrap(
        '<path d="M4.6 6.6h14.8"></path>' +
        '<path d="M9.4 6.6V4.8a1.2 1.2 0 0 1 1.2-1.2h2.8a1.2 1.2 0 0 1 1.2 1.2v1.8"></path>' +
        '<path d="M6.6 6.6l1 12.2a1.6 1.6 0 0 0 1.6 1.4h5.6a1.6 1.6 0 0 0 1.6-1.4l1-12.2"></path>'
    ),

    pencil: wrap(
        '<path d="M16.6 3.6a1.9 1.9 0 0 1 2.7 2.7L7.6 18l-3.6 1 1-3.6z"></path>' +
        '<path d="M15.2 5l2.7 2.7"></path>'
    ),

    bell: wrap(
        '<path d="M18 9.6a6 6 0 1 0-12 0c0 4.2-1.4 5.6-1.4 5.6h14.8S18 13.8 18 9.6z"></path>' +
        '<path d="M13.7 18.6a2 2 0 0 1-3.4 0"></path>'
    ),

    chevron: wrap('<polyline points="6 9 12 15 18 9"></polyline>'),

    up: wrap('<polyline points="6 14 12 8 18 14"></polyline>'),
    down: wrap('<polyline points="6 10 12 16 18 10"></polyline>'),

    chart: wrap(
        '<path d="M3.4 3.4v17.2h17.2"></path>' +
        '<path d="M7 15.2l3.4-4.6 3 2.6 4.6-6.2"></path>'
    ),

    back: wrap(
        '<polyline points="14.5 18.5 8 12 14.5 5.5"></polyline>' +
        '<line x1="18.5" y1="12" x2="8.5" y2="12"></line>'
    )
};

export function icon(name) { return ICONS[name] || ICONS.chart; }
