// Node-RED settings for the bas-nodered container (see docker-compose.yml).
module.exports = {
    flowFile: "flows.json",
    flowFilePretty: true,

    // Leave flows_cred.json unencrypted: it holds no secrets, only ${MQTT_USERNAME} /
    // ${MQTT_PASSWORD} placeholders that Node-RED fills in from the container environment.
    credentialSecret: false,

    uiPort: process.env.PORT || 1880,

    functionExternalModules: true,
    functionGlobalContext: {},
    exportGlobalContextKeys: false,

    logging: {
        console: { level: "info", metrics: false, audit: false },
    },

    editorTheme: {
        projects: { enabled: false },
    },
};
