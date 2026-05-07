var map = new maplibregl.Map({
    container: 'map',
    style: 'https://tile.openstreetmap.jp/styles/osm-bright-ja/style.json',
    center: [139.423323139, 35.998809],
    zoom: 14,
    pitch: 0
});

// 現在地コントロール（GPS・電波不要）
map.addControl(new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true
}), 'top-left');

// ズーム・方位コントロール
map.addControl(new maplibregl.NavigationControl(), 'top-right');

// データファイル定義
// ★ KML/GPXを追加する場合はここに1行追記するだけ
const dataFiles = [
    { file: 'arakawa_suijin_marker.kml', type: 'kml', lineColor: '#c0392b', pointColor: '#e74c3c' },
    { file: 'd_west.gpx',                type: 'gpx', lineColor: '#2980b9', pointColor: '#3498db' },
];

map.on('load', () => {
    dataFiles.forEach((item, index) => {
        const id = 'layer-' + index;

        fetch(item.file)
            .then(r => r.text())
            .then(text => {
                const doc = new DOMParser().parseFromString(text, 'text/xml');
                const geojson = item.type === 'gpx'
                    ? toGeoJSON.gpx(doc)
                    : toGeoJSON.kml(doc);

                map.addSource(id, { type: 'geojson', data: geojson });

                // ルートライン
                map.addLayer({
                    id: id + '-line',
                    type: 'line',
                    source: id,
                    filter: ['in', '$type', 'LineString'],
                    paint: {
                        'line-color': item.lineColor,
                        'line-width': 3,
                        'line-opacity': 0.85
                    }
                });

                // マーカー（円）
                map.addLayer({
                    id: id + '-point',
                    type: 'circle',
                    source: id,
                    filter: ['==', '$type', 'Point'],
                    paint: {
                        'circle-radius': 7,
                        'circle-color': item.pointColor,
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#ffffff',
                        'circle-opacity': 0.9
                    }
                });

                // マーカータップでポップアップ
                map.on('click', id + '-point', e => {
                    const props = e.features[0].properties;
                    const name = props.name || '（名称なし）';
                    const rawDesc = props.description || '';
                    const desc = rawDesc.replace(/<img[^>]*>/gi, '').replace(/<[^>]*>/g, '').trim();
                    new maplibregl.Popup({ maxWidth: '240px' })
                        .setLngLat(e.features[0].geometry.coordinates)
                        .setHTML('<strong>' + name + '</strong>' + (desc ? '<br><small>' + desc + '</small>' : ''))
                        .addTo(map);
                });

                map.on('mouseenter', id + '-point', () => { map.getCanvas().style.cursor = 'pointer'; });
                map.on('mouseleave', id + '-point', () => { map.getCanvas().style.cursor = ''; });
            })
            .catch(err => console.warn(item.file + ' 読み込みエラー:', err));
    });
});
