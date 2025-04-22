//// chargement de base de la carte et des données

/// Initialisation
// Chargement des variables globales
let geojsonData = null;
let filteredPoints = null;
let choixProfession = null;
let choixMedecin = 0;
let isOn = false;
let clickedCoordinates = null;
let etatPage = "base" // Trois état : base, scenario, naviguer
let routeTriGlobal = null; // Variable accessible globalement



let dataLoadedResolver;
const dataIsLoaded = new Promise(resolve => {
    dataLoadedResolver = resolve;
});

// Fonction pour charger les données une seule fois
async function loadData() {
    const response = await fetch("https://raw.githubusercontent.com/Charly-Ciant/data/main/pts_prof_sante4326.geojson");
    geojsonData = await response.json();
    console.log("Données chargées :", geojsonData);
    dataLoadedResolver();
    return geojsonData;  // Retourner les données pour les réutiliser
}

// fonction d'affichage de la donnée en point
async function chgt_carte() {
    const data_point = await loadData(); // Charger les données

    // 1. Ajouter la source à la carte
    map.addSource('data_point', {
        type: 'geojson',
        data: data_point
    });

    // 2. Ajouter le layer
    map.addLayer({
        id: 'point_base',
        type: 'circle',
        source: 'data_point', // Référence au nom de la source ajoutée juste au-dessus
        paint: {
            'circle-radius': 3,
            'circle-color': '#106b61',
            'circle-opacity': 0.25
        }
    });

    // COUCHE DES LIMITES REGIONS
    $.getJSON("https://raw.githubusercontent.com/Charly-Ciant/data/main/limites_regions.geojson", function (data) {
        map.addSource('limites_regions', {
            type: 'geojson',
            data: data,
        });
        map.addLayer({
            id: 'regions',
            type: 'line',
            source: 'limites_regions',
            paint: { 'line-color': '#666666', 'line-width': 0.8 }
        });
    });
}



/// état de base de la carte à l'ouverture du site (et sans sélection)
// configuration de la carte
var map = new maplibregl.Map({
    container: 'map',
    style: 'https://openmaptiles.geo.data.gouv.fr/styles/osm-bright/style.json', // Fond de carte
    center: [-3.2, 48.1], // lat/long
    zoom: 6.7, // zoom
    pitch: 0, // Inclinaison
    bearing: 0, // Rotation
    attributionControl: false
});

// affichage des point une fois les données chargées
map.on('load', () => {
    chgt_carte();
});





















////déclaration des fonction


/// fonctions itinéraire

// a usage unique : pendant l'initialisation
// Fonction pour remplir plusieurs listes déroulantes avec les professions
async function populateDropdowns(selectIds = []) {
    try {
        const data = await loadData(); // Charger les données

        if (!data || !data.features) {
            console.error("Erreur : données invalides !");
            return;
        }

        // Extraire les professions uniques
        const professions = [...new Set(data.features.map(f => f.properties.Profession))];

        // Pour chaque ID de <select>, remplir la liste
        selectIds.forEach(id => {
            const selectElement = document.getElementById(id);
            if (!selectElement) {
                console.warn(`Aucun élément trouvé avec l’ID : ${id}`);
                return;
            }

            // Nettoyer l'existant sauf l'option par défaut (si présente)
            selectElement.length = 1; // garde juste la première option

            // Ajouter chaque profession
            professions.forEach(profession => {
                const option = document.createElement("option");
                option.value = profession;
                option.textContent = profession;
                selectElement.appendChild(option);
            });
        });

        console.log("Listes déroulantes remplies avec les professions :", professions);
    } catch (error) {
        console.error("Erreur lors du chargement des données :", error);
    }
}



// Fonction pour filtrer les médecins après le choix
function processData() {
    if (!geojsonData) {
        console.log("Les données ne sont pas chargées !");
        return;
    }
    filteredPoints = geojsonData.features.filter(f => f.properties.Profession === choixProfession);
    console.log("Médecins filtrés :", filteredPoints);
}


// Fonction pour calculer la distance euclidienne
function euclideanDistance(coord1, coord2) {
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;
    return Math.sqrt(Math.pow(lon2 - lon1, 2) + Math.pow(lat2 - lat1, 2));
}


// fonction pour suppr les anciennes couches
function removeLayerIfExists(layerId) {
    if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
    }
    if (map.getSource(layerId)) {
        map.removeSource(layerId);
    }
}


// fonction pour l'affichage du gif de chargement
function showLoader() {
    document.getElementById('loader').style.display = 'flex';
}

function hideLoader() {
    document.getElementById('loader').style.display = 'none';
}

// capitalise la 1e lettre de chaque mot pour un affichage plus propre
function capitalizeWords(str) {
    return str.split(' ').map(word => {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
}

// fonction pour zoomer sur l'itnéraire
function rezoomDernierTrajet(routeTri) {
    if (!routeTri || routeTri.length === 0) {
        console.warn("Aucun trajet à recentrer.");
        return;
    }

    const coordinates = routeTri[0].routeData.routes[0].geometry.coordinates;

    let minLng = coordinates[0][0];
    let minLat = coordinates[0][1];
    let maxLng = coordinates[0][0];
    let maxLat = coordinates[0][1];

    for (const [lng, lat] of coordinates) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
    }

    const width = map.getCanvas().clientWidth;
    const height = map.getCanvas().clientHeight;

    const padding = {
        top: height * 0.2,
        bottom: height * 0.2,
        left: width * 0.5,
        right: width * 0.2
    };

    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
        padding,
        duration: 2000
    });
}






// Fonction principale pour calculer les itinéraires
async function calcul_distance() {

    // affichage du gif de chargement
    showLoader();

    if (!filteredPoints || filteredPoints.length === 0) {
        console.log("Les données filtrées ne sont pas disponibles !");
        return;
    }

    // Supprimer les anciennes couches
    removeLayerIfExists('destination-layer');
    removeLayerIfExists('itineraireLePlusCourt');

    console.log("Calcul des distances...");

    const destinations = filteredPoints
        .map(point => ({
            nom: point.properties["Nom.du.professionnel"],
            adresse: point.properties.Adresse,
            profession: point.properties.Profession,
            coordinates: point.geometry.coordinates,
            telephone: point.properties["Numéro.de.téléphone"] || 'Non disponible',
            distance: euclideanDistance(clickedCoordinates, point.geometry.coordinates)
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10);

    console.log("10 points les plus proches :", destinations);


    // Récupération des itinéraires
    const routePromises = destinations.map(dest =>
        fetch(`https://router.project-osrm.org/route/v1/driving/${clickedCoordinates.join(',')};${dest.coordinates.join(',')}?overview=full&geometries=geojson`)
            .then(res => res.json())
            .then(routeData => ({ routeData, medecin: dest }))
    );


    const routesData = await Promise.all(routePromises);
    const routesTri = routesData.sort((a, b) => a.routeData.routes[0].duration - b.routeData.routes[0].duration);

    console.log("Itinéraire le plus court :", routesTri[0]);

    map.flyTo({ zoom: 12, center: [routesTri[0].medecin.coordinates[0], routesTri[0].medecin.coordinates[1]] });

    if (routesTri.length > 0) {
        map.addLayer({
            id: 'destination-layer',
            type: 'circle',
            source: {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection', // Nécessaire pour une collection de features GeoJSON
                    features: [
                        {
                            type: 'Feature',
                            geometry: {
                                type: 'Point', // Spécifie qu'il s'agit d'un point
                                coordinates: routesTri[0].medecin.coordinates // Les coordonnées du médecin
                            },
                        }
                    ]
                }
            },
            paint: {
                'circle-color': 'red',
                'circle-radius': 8
            }
        });
        map.addLayer({
            id: 'itineraireLePlusCourt',
            type: 'line',
            source: {
                type: 'geojson',
                data: { type: 'Feature', geometry: routesTri[0].routeData.routes[0].geometry }
            },
            paint: { 'line-color': '#179f91', 'line-width': 4 }
        });


        console.log(`Distance : ${routesTri[0].routeData.routes[0].distance} mètres`);

        rezoomDernierTrajet(routesTri);


    }

    // contenu du message html
    const message = `
    <hr>
    <h2><u>Professionnel de santé le plus proche :</u></h2>
    <p class="texte-petit">Profession : <strong>${routesTri[0].medecin.profession}</strong></p>
    <p class="texte-petit">Distance : <strong>${Math.round((routesTri[0].routeData.routes[0].distance / 1000) * 100) / 100} km</strong></p>
    <p class="texte-petit">Nom : <strong>${capitalizeWords(routesTri[0].medecin.nom)}</strong></p>
    <p class="texte-petit">Adresse : <strong>${capitalizeWords(routesTri[0].medecin.adresse)}</strong></p>
    <p class="texte-petit">Téléphone : <strong>${capitalizeWords(routesTri[0].medecin.telephone)}</strong></p>
    `;
    document.getElementById('message_itineraire').innerHTML = message;


    // cache le gif
    hideLoader()

    return routesTri;
}


/// fonction cluster
// Fonction pour filtrer et afficher les médecins en clusters, y compris les couches cluster-count et unclustered-point
function filterAndDisplayClusters() {
    const selectedProfessionCluster = document.getElementById("paramChoixProf_naviguer").value;

    // Vérifier si les données sont bien chargées
    if (!geojsonData) {
        console.log("Les données ne sont pas chargées !");
        return;
    }


    let filteredPointsCluster = '';
    // Filtrer les points selon la profession choisie
    if (selectedProfessionCluster !== '') {
        filteredPointsCluster = geojsonData.features.filter(f => f.properties.Profession === selectedProfessionCluster);
    } else { filteredPointsCluster = geojsonData.features }
    console.log(filteredPointsCluster)

    // Vérifier si des points existent pour cette profession
    if (filteredPointsCluster.length === 0) {
        console.log("Aucun médecin trouvé pour cette profession :", selectedProfessionCluster);
        return;
    }

    console.log("Clusters mis à jour pour :", selectedProfessionCluster);

    // suppression des anciennes couches
    removeLayerIfExists('clusters_filtre');
    removeLayerIfExists('cluster-count_filtre');
    removeLayerIfExists('unclustered-point_filtre');
    
    const popups = document.getElementsByClassName("maplibregl-popup");
    if (popups.length) {popups[0].remove();}   

    if (map.getSource('clusters_source_filtre')) {
        map.removeSource('clusters_source_filtre');
    }


    // Ajouter les sources filtrées
    map.addSource('clusters_source_filtre', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: filteredPointsCluster
        },
        cluster: true,
        clusterMaxZoom: 11,
        clusterRadius: 50
    });

    // Ajouter les nouvelles couches filtrées avec les couleurs identiques à la couche de base 'clusters'
    map.addLayer({
        id: 'clusters_filtre',
        type: 'circle',
        source: 'clusters_source_filtre',
        filter: ['has', 'point_count'], // Filtre les clusters
        paint: {
            'circle-color': [
                'step',
                ['get', 'point_count'],
                '#baebe5', 10,
                '#2bbeae', 50,
                '#106b61'
            ],
            'circle-radius': [
                'step',
                ['get', 'point_count'],
                13, 10, // Si le cluster contient entre 1 et 9 points, le rayon est de 15 pixels
                19, 50, // Si le cluster contient entre 10 et 49 points, le rayon passe à 20 pixels
                25 // Si le cluster contient 50 points ou plus, le rayon est de 30 pixels
            ]
        }
    });

    // Ajout du nombre de points dans chaque cluster
    map.addLayer({
        id: 'cluster-count_filtre',
        type: 'symbol',
        source: 'clusters_source_filtre',
        filter: ['has', 'point_count'],
        layout: {
            'text-field': '{point_count}',
            'text-size': 12,
            'text-font': ['Arial Unicode MS Bold']
        },
        paint: {
            'text-color': [
                'step',
                ['get', 'point_count'],
                '#000000', 50, // Seuil : si point_count >= 50
                '#FFFFFF'  // Blanc pour les grands clusters
            ]
        }
    });

    // Couches pour les points individuels (qui ne sont pas en cluster)
    map.addLayer({
        id: 'unclustered-point_filtre',
        type: 'circle',
        source: 'clusters_source_filtre',
        filter: ['!', ['has', 'point_count']], // Affiche uniquement les points non clusterisés
        paint: {
            'circle-color': '#106b61',
            'circle-radius': 5
        }
    });

    // ZOOM ET POPUP POUR LES CLUSTERS FILTRES
    map.on('click', 'clusters_filtre', async (e) => {
        const features = map.queryRenderedFeatures(e.point, {
            layers: ['clusters_filtre']
        });
        const clusterId = features[0].properties.cluster_id;
        const zoom = await map.getSource('clusters_source_filtre').getClusterExpansionZoom(clusterId);
        map.easeTo({
            center: features[0].geometry.coordinates,
            zoom: zoom + 1.5
        });
    });

    // POPUP POUR LES CLUSTERS FILTRES
    map.on('click', 'unclustered-point_filtre', function (e) {
        var coordinates = e.lngLat;
        var properties = e.features[0].properties; // Propriétés du point cliqué

        // Filtrer uniquement les champs "Nom.du.professionel", "Adresse" et "Profession"
        var nom = properties["Nom.du.professionnel"] || 'Non disponible';
        var profession = properties["Profession"] || 'Non disponible';
        var adresse = properties["Adresse"] || 'Non disponible';
        var telephone = properties["Numéro.de.téléphone"] || 'Non disponible';

        // Crée une popup pour afficher les propriétés spécifiques
        popups = new maplibregl.Popup({ maxWidth: '600px' })
            .setLngLat(coordinates) // Position de la popup
            .setHTML('<div class="popup-content">' +
                '<div class="popup-header"><h2>' + nom + '</h2></div>' +
                '<div class="popup-body">' +
                '<p><b>Profession:</b> ' + profession + '</p>' +
                '<p><b>Adresse:</b> ' + adresse + '</p>' +
                '<p><b>Téléphone:</b> ' + telephone + '</p>' +
                '</div>' + '</div>')
            .addTo(map); // Ajoute la popup à la carte
    });

}

// Ajouter un event listener pour écouter les changements de sélection
document.getElementById("paramChoixProf_naviguer").addEventListener("change", filterAndDisplayClusters);












//// intéractivité du site

// Ajout des contrôles de navigation
var nav = new maplibregl.NavigationControl();
map.addControl(nav, 'top-right');

// Ajout de l'échelle cartographique
map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }));


// Modification des crédits / attribution
const attribution = new maplibregl.AttributionControl({ compact: true, customAttribution: 'Réalisation : M2 SIGAT 2025 | Données : <a href="https://public.opendatasoft.com/explore/dataset/medecins/table/"><b>Annuaire Santé CPAM </b></a> ' });
map.addControl(attribution, 'bottom-right');


// Configuration onglets geographiques, boutons pour se tp à des endroits
document.getElementById('Rennes').addEventListener('click', function () {
    map.flyTo({ zoom: 11, center: [-1.678995, 48.109869], offset: [200, 0] });
});
document.getElementById('Brest').addEventListener('click', function () {
    map.flyTo({ zoom: 11, center: [-4.47363, 48.394912], offset: [200, 0] });
});
document.getElementById('Nantes').addEventListener('click', function () {
    map.flyTo({ zoom: 11, center: [-1.555365, 47.214405], offset: [200, 0] });
});
document.getElementById('Angers').addEventListener('click', function () {
    map.flyTo({ zoom: 11, center: [-0.55112, 47.471574], offset: [200, 0] });
});
document.getElementById('Caen').addEventListener('click', function () {
    map.flyTo({ zoom: 11, center: [-0.362837, 49.18035], offset: [200, 0] });
});
document.getElementById('Rouen').addEventListener('click', function () {
    map.flyTo({ zoom: 11, center: [1.092947, 49.440478], offset: [200, 0] });
});


/// intéractivité charlyyyyy
// JS pour lancer l'animation au chargement de la page
window.addEventListener('load', () => {
    // On déclenche l'apparition des éléments dès le chargement
    const doubleBouton = document.getElementById('double-bouton');
    const infoFenetre = document.getElementById('info-fenetre');

    // On ajoute la classe d'animation pour afficher les éléments
    doubleBouton.style.opacity = '1'; // Le double bouton devient visible
    infoFenetre.style.opacity = '1'; // La fenêtre d'info devient visible
});

window.onload = function () {
    // Attendre un moment pour que l'animation soit bien visible
    setTimeout(function () {
        document.getElementById('bandeau').classList.add('show');
    }, 100); // Petit délai pour que la page se charge avant l'animation
};

// Récupérer les éléments
const scenarioButton = document.querySelector('.btn-scenario');
const infoFenetre = document.getElementById('info-fenetre');
const fenetreScenario = document.getElementById('fenetre-scenario');
const fenetreNaviguer = document.getElementById('fenetre-naviguer');
const naviguerButton = document.querySelector('.btn-naviguer');

// Fonction générique pour gérer l'affichage avec fondu
function showWindow(windowElement) {
    windowElement.style.display = 'block';
    setTimeout(() => {
        windowElement.style.opacity = '1'; // Apparition fluide
    }, 50);
}

// Fonction générique pour gérer la disparition avec fondu
function hideWindow(windowElement) {
    windowElement.style.opacity = '0';
    setTimeout(() => {
        windowElement.style.display = 'none'; // Masquer complètement après l'animation
    }, 500); // Temps de l'animation de fondu
}

// Fonction pour cacher uniquement la fenêtre d'info
function hideInfoWindow() {
    hideWindow(infoFenetre);
}






// Ajout d'un événement au bouton "Scénario"
scenarioButton.addEventListener('click', () => {
    // Si la fenêtre "Scénario" est déjà ouverte, la fermer et réafficher la fenêtre d'info
    if (fenetreScenario.style.display === 'block') {
        hideWindow(fenetreScenario); // Fermer la fenêtre Scénario
        showWindow(infoFenetre);     // Réafficher la fenêtre d'info
        etatManager.etatPage = "base"
    } else {
        // Cacher la fenêtre "Naviguer" si elle est ouverte avant d'ouvrir "Scénario"
        if (fenetreNaviguer.style.display === 'block') {
            fenetreNaviguer.style.opacity = '0';
            setTimeout(() => {
                fenetreNaviguer.style.display = 'none'; // Masquer complètement après l'animation
            }, 500); // Temps de l'animation de fondu
            etatManager.etatPage = "scenario"
        }
        hideInfoWindow(); // Cacher la fenêtre d'info
        // Afficher la fenêtre "Scénario"
        showWindow(fenetreScenario);
        etatManager.etatPage = "scenario"
    }
});

// Ajout d'un événement au bouton "Naviguer"
naviguerButton.addEventListener('click', () => {
    // Si la fenêtre "Naviguer" est déjà ouverte, la fermer et réafficher la fenêtre d'info
    if (fenetreNaviguer.style.display === 'block') {
        hideWindow(fenetreNaviguer); // Fermer la fenêtre Naviguer
        showWindow(infoFenetre);     // Réafficher la fenêtre d'info
        etatManager.etatPage = "base"
    } else {
        // Cacher la fenêtre "Scénario" si elle est ouverte avant d'ouvrir "Naviguer"
        if (fenetreScenario.style.display === 'block') {
            fenetreScenario.style.opacity = '0';
            setTimeout(() => {
                fenetreScenario.style.display = 'none'; // Masquer complètement après l'animation
            }, 500); // Temps de l'animation de fondu
            etatManager.etatPage = "naviguer"
        }
        hideInfoWindow(); // Cacher la fenêtre d'info
        showWindow(fenetreNaviguer); // Afficher la fenêtre "Naviguer"
        etatManager.etatPage = "naviguer"
    }
});



const etatManager = {
    _etatPage: null,

    get etatPage() {
        return this._etatPage;
    },

    set etatPage(nouvelEtat) {
        if (this._etatPage !== nouvelEtat) {
            this._etatPage = nouvelEtat;
            onEtatPageChange(nouvelEtat); // appel automatique
        }
    }
};


// fonction pour afficher cacher les couches concernées
function toggleLayers(layers = [], visibility = "none") {
    layers.forEach(layerId => {
        if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, "visibility", visibility);
        } else {
            console.warn(`La couche "${layerId}" n'existe pas sur la carte.`);
        }
    });
}




// Fonction appelée automatiquement à chaque changement
function onEtatPageChange(etat) {
    console.log("Changement d'état :", etat);

    switch (etat) {
        case "base":
            // Code pour l'état "base"
            console.log("→ retour à l'état de base");

            // Pour afficher
            toggleLayers([
                "point_base"
            ], "visible");

            // Pour masquer
            toggleLayers([
                "itineraireLePlusCourt",
                "destination-layer",
                "start-point-layer",
                "clusters_filtre",
                "unclustered-point_filtre",
                "cluster-count_filtre"
            ], "none");

            //dézoomer sur la carte du grand ouest
            map.flyTo({
                center: [-3.2, 48.1], // lat/long
                zoom: 6.7, // zoom
                duration: 2000
            })

            break;

        case "naviguer":
            // Code pour afficher/cacher les bons éléments
            console.log("→ mode navigation activé");

            // Pour afficher
            toggleLayers([
                "clusters_filtre",
                "unclustered-point_filtre",
                "cluster-count_filtre"
            ], "visible");

            // Pour masquer
            toggleLayers([
                "itineraireLePlusCourt",
                "destination-layer",
                "start-point-layer",
                "point_base"
            ], "none");

            if (!map.getLayer('clusters_filtre')) {
                console.log("prout")
                filterAndDisplayClusters()
            };

            break;

        case "scenario":
            // Code pour activer les couches de scénario, afficher la fenêtre, etc.
            console.log("→ affichage du scénario");
            // Pour afficher
            toggleLayers([
                "itineraireLePlusCourt",
                "destination-layer",
                "start-point-layer"
            ], "visible");

            // Pour masquer
            toggleLayers([
                "point_base",
                "clusters_filtre",
                "unclustered-point_filtre",
                "cluster-count_filtre"
            ], "none");

            rezoomDernierTrajet(routeTriGlobal);

            break;

        default:
            console.warn("État inconnu :", etat);
    }
}








/// intéractivité itinéraire
// Sélection des boutons
const toggleButton = document.getElementById("toggleButton");
const executeButton = document.getElementById("executeButton");

// Fonction pour gérer le clic sur la carte
function handleMapClick(e) {
    clickedCoordinates = [e.lngLat.lng, e.lngLat.lat];
    console.log("Coordonnées du clic :", clickedCoordinates);
    addStartPoint(clickedCoordinates); // Ajouter immédiatement le point sur la carte
    checkParams();
}

// fonction pour l'affichage du point de départ
function addStartPoint(coords) {
    // Supprimer l'ancien point s'il existe
    removeLayerIfExists('start-point-layer');

    // Ajouter le nouveau point sur la carte
    map.addLayer({
        id: 'start-point-layer',
        type: 'circle',
        source: {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'Point', coordinates: coords } }
        },
        paint: { 'circle-radius': 8, 'circle-color': '#106b61' }
    });
}

// Gestion du bouton ON/OFF pour choisir un point sur la carte
toggleButton.addEventListener("click", () => {
    isOn = !isOn;
    toggleButton.textContent = isOn ? "Récupérer le point" : "Placer un point";
    toggleButton.classList.toggle("on", isOn);


    if (isOn) {
        map.on("click", handleMapClick);
        map.getCanvas().style.cursor = "crosshair";
    } else {
        map.off("click", handleMapClick);
        map.getCanvas().style.cursor = "";
    }
});

executeButton.disabled = true;
// Vérifi si les paramètres sont définis pour activer le bouton
function checkParams() {
    if (!isOn && clickedCoordinates && choixProfession) {
        executeButton.disabled = false;
    } else {
        executeButton.disabled = true;
    }
}

// verif du bouton prof
document.getElementById("paramChoixProf_itineraire").addEventListener("click", function (event) {
    choixProfession = event.target.value;
    checkParams();
});
// verif du bouton pos
document.getElementById("toggleButton").addEventListener("click", function (event) {
    checkParams();
});


//// execution des fonctions

// liste des professions
populateDropdowns([
    "paramChoixProf_itineraire",
    "paramChoixProf_naviguer"
]);



// EXÉCUTER LES CALCULS LORSQUE L'UTILISATEUR CLIQUE SUR "Exécuter"
executeButton.addEventListener("click", async function () {
    console.log(`Calcul en cours pour ${choixProfession} à ${clickedCoordinates}`);
    processData();  // Filtrer les données avant calcul
    routeTriGlobal = await calcul_distance();
});
