var map = new maplibregl.Map({
  container: "map",
  style: "https://tile.openstreetmap.jp/styles/osm-bright-ja/style.json",
  center: [139.423323139, 35.998809],
  zoom: 14,
  pitch: 0,
});

// 現在地コントロール（GPS・電波不要）
map.addControl(
  new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true,
  }),
  "top-left",
);

// ズーム・方位コントロール
map.addControl(new maplibregl.NavigationControl(), "top-right");

// データファイル定義
// ★ KML/GPXを追加する場合はここに追記する
const dataFiles = [
  {
    id: "suijin",
    file: "arakawa_suijin_marker.kml",
    type: "kml",
    lineColor: "#c0392b",
    pointColor: "#e74c3c",
  },
  {
    id: "toilet",
    file: "toilet.kml",
    type: "kml",
    lineColor: "#0f766e",
    pointColor: "#0ea5e9",
  },
  {
    id: "route",
    file: "d_west.gpx",
    type: "gpx",
    lineColor: "#d95e21",
    pointColor: "#3498db",
  },
  {
    id: "outbound_kumagaya-2026",
    file: "Outbound_2026_kumagaya.gpx",
    type: "gpx",
    lineColor: "#431296",
    pointColor: "#3498db",
  },
  {
    id: "return_kumagaya-2026",
    file: "Return_2026_kumagaya.gpx",
    type: "gpx",
    lineColor: "#961247",
    pointColor: "#3498db",
  },
];

const layerIdsByGroup = {};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setGroupVisibility(groupId, visible) {
  (layerIdsByGroup[groupId] || []).forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(
        layerId,
        "visibility",
        visible ? "visible" : "none",
      );
    }
  });
}

map.on("load", () => {
  let toiletIconLoaded = false;

  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        map.addImage("toilet-icon", img);
        toiletIconLoaded = true;
      } catch (error) {
        console.warn("toilet.png 登録失敗", error);
      }
      resolve();
    };
    img.onerror = () => {
      console.warn("toilet.png 読み込み失敗");
      resolve();
    };
    img.src = "toilet.png";
  }).then(() => {
    dataFiles.forEach((item) => {
      const id = "layer-" + item.id;
      layerIdsByGroup[item.id] = [id + "-line", id + "-point"];

      fetch(item.file)
        .then((r) => r.text())
        .then((text) => {
          const doc = new DOMParser().parseFromString(text, "text/xml");
          const geojson =
            item.type === "gpx" ? toGeoJSON.gpx(doc) : toGeoJSON.kml(doc);

          map.addSource(id, { type: "geojson", data: geojson });

          // ルートライン
          map.addLayer({
            id: id + "-line",
            type: "line",
            source: id,
            filter: ["in", "$type", "LineString"],
            paint: {
              "line-color": item.lineColor,
              "line-width": 5,
              "line-opacity": 0.85,
            },
          });

          // マーカー（トイレはPNGアイコン、その他は円）
          if (item.id === "toilet" && toiletIconLoaded) {
            map.addLayer({
              id: id + "-point",
              type: "symbol",
              source: id,
              filter: ["==", "$type", "Point"],
              layout: {
                "icon-image": "toilet-icon",
                "icon-size": 0.05,
                "icon-allow-overlap": true,
              },
            });
          } else {
            map.addLayer({
              id: id + "-point",
              type: "circle",
              source: id,
              filter: ["==", "$type", "Point"],
              paint: {
                "circle-radius": 9,
                "circle-color": item.pointColor,
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
                "circle-opacity": 0.9,
              },
            });
          }

          const toggle = document.querySelector(
            '[data-layer-toggle="' + item.id + '"]',
          );
          if (toggle) {
            setGroupVisibility(item.id, toggle.checked);
          }

          // マーカータップでポップアップ
          map.on("click", id + "-point", (e) => {
            const props = e.features[0].properties;
            const name = props.name || "（名称なし）";
            const rawDesc = props.description || "";
            const desc = rawDesc
              .replace(/<img[^>]*>/gi, "")
              .replace(/<[^>]*>/g, "")
              .trim();
            new maplibregl.Popup({ maxWidth: "240px" })
              .setLngLat(e.features[0].geometry.coordinates)
              .setHTML(
                "<strong>" +
                  escapeHtml(name) +
                  "</strong>" +
                  (desc ? "<br><small>" + escapeHtml(desc) + "</small>" : ""),
              )
              .addTo(map);
          });

          map.on("mouseenter", id + "-point", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", id + "-point", () => {
            map.getCanvas().style.cursor = "";
          });
        })
        .catch((err) => console.warn(item.file + " 読み込みエラー:", err));
    });

    document.querySelectorAll("[data-layer-toggle]").forEach((toggle) => {
      toggle.addEventListener("change", (event) => {
        setGroupVisibility(
          event.target.dataset.layerToggle,
          event.target.checked,
        );
      });
    });
  }); // end .then
});
