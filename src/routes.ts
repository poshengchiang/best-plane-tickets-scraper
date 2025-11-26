import { createCheerioRouter, Dataset } from 'crawlee';

export const router = createCheerioRouter();

router.addDefaultHandler(async ({ enqueueLinks, request, $, log }) => {
    log.info('Processing START page', { url: request.loadedUrl });

    await enqueueLinks({
        label: 'DETAIL',
    });

    const title = $('title').text();
    log.info(`Page title: ${title}`, { url: request.loadedUrl });

    await Dataset.pushData({
        url: request.loadedUrl,
        title,
        label: 'START',
    });
});

router.addHandler('DETAIL', async ({ request, $, log }) => {
    log.info('Processing DETAIL page', { url: request.loadedUrl });

    const title = $('title').text();

    const data = {
        url: request.loadedUrl,
        title,
        label: 'DETAIL',
    };

    await Dataset.pushData(data);
});
