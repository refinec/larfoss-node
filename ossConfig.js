const OSS = require('ali-oss');

module.exports = function ({
    accesskey = '',
    accessSecret = '',
    bucket = '',
    region = '',
    internal = false,
    cname = false,
    secure = false,
    endpoint = '',
    internalEndpoint = endpoint
}) {
    const client = OSS({
        accessKeyId: accesskey,
        accessKeySecret: accessSecret,
        bucket,
        endpoint,
        region,
        internal,
        cname,
        secure,
    });

    client.putBucketCORS(bucket, [{
        allowedOrigin: '*',
        allowedMethod: [
            'GET',
            'HEAD',
            'POST',
            'PUT',
            'DELETE'
        ],
        allowedHeader: '*'
    }]).then(() => {});

    const internalClient = OSS({
        accessKeyId: accesskey,
        accessKeySecret: accessSecret,
        bucket,
        endpoint: internalEndpoint,
        region,
        internal,
        cname,
        secure,
    });

    internalClient.putBucketCORS(bucket, [{
        allowedOrigin: '*',
        allowedMethod: [
            'GET',
            'HEAD',
            'POST',
            'PUT',
            'DELETE'
        ],
        allowedHeader: '*'
    }]).then(() => {});

    return {
        client,
        internalClient
    }
}
