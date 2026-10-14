module.exports = {
    flowFile: "flows.json",
    flowFilePretty: true,

    credentialSecret: false,

    uiPort: process.env.PORT || 1880,

    adminAuth: process.env.NODERED_ADMIN_PASSWORD_HASH ? {
        type: "credentials",
        users: [{
            username: process.env.NODERED_ADMIN_USER || "admin",
            password: process.env.NODERED_ADMIN_PASSWORD_HASH,
            permissions: "*",
        }],
    } : undefined,

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
