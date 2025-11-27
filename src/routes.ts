import { createCheerioRouter, Dataset } from 'crawlee';

import { LABELS } from './constants.js';

export const router = createCheerioRouter();

router.addDefaultHandler(async ({ enqueueLinks, request, $, log }) => {
    log.info('Processing START page', { url: request.loadedUrl });

    await enqueueLinks({
        label: LABELS.DETAIL,
    });

    const title = $('title').text();
    log.info(`Page title: ${title}`, { url: request.loadedUrl });

    await Dataset.pushData({
        url: request.loadedUrl,
        title,
        label: LABELS.START,
    });
});

router.addHandler(LABELS.DETAIL, async ({ request, $, log }) => {
    log.info('Processing DETAIL page', { url: request.loadedUrl });

    const title = $('title').text();

    const data = {
        url: request.loadedUrl,
        title,
        label: LABELS.DETAIL,
    };

    await Dataset.pushData(data);
});
