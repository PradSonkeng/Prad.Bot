module.exports = {
    apps: [{
        name:           'whatsapp-bot',
        script:         'src/index.js',
        instances:      1,
        autorestart:    true,
        watch:          false,
        max_memory_restart:    '512M',
        env: {
            NODE_ENV:   'production',
        },
        log_date_format:    'YYYY-MM-DD HH:mm:ss',
        error_file:     './logs/err.log',
        out_file:       './logs/out.log',
        merge_logs:     true,
    }],
};