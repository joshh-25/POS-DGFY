import {
  resolveExternalRedirectUseCase,
  listExternalAdminUseCase,
  saveExternalSiteUseCase,
  setExternalSiteVisibilityUseCase,
  saveExternalListingUseCase,
  setExternalListingVisibilityUseCase,
  removeExternalListingUseCase,
  clearTemporaryExternalListingsUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const respond = (res, result, successStatus = 200) => sendUseCaseResult(res, result, {
  successStatusCodeResolver: () => successStatus,
  successPayloadResolver: () => ({ success: true, data: result.data }),
  errorPayloadResolver: (failure) => ({ success: false, message: failure.message, error_code: failure.code })
});

export const redirectExternalListing = async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Robots-Tag', 'noindex');
    const result = await resolveExternalRedirectUseCase({ slug: req.params.slug });
    if (!result.success) {
      if (req.get('Accept')?.includes('application/json')) return respond(res, result);
      return res.status(404).type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><title>Link unavailable</title><main><h1>Link unavailable</h1><p>This external listing or destination is unavailable.</p><a href="https://dgfy.ph/">Back to DGFY</a></main></html>');
    }
    if (req.get('Accept')?.includes('application/json')) {
      return res.status(200).json({ success: true, data: { destination: result.data.destination } });
    }
    return res.redirect(302, result.data.destination);
  } catch (error) {
    return next(error);
  }
};

export const listExternalAdmin = async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    return respond(res, await listExternalAdminUseCase());
  } catch (error) { return next(error); }
};

export const saveExternalSite = async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    return respond(res, await saveExternalSiteUseCase({ siteKey: req.params.siteKey, payload: req.body, admin: req.admin }));
  } catch (error) { return next(error); }
};

export const setExternalSiteVisibility = async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    return respond(res, await setExternalSiteVisibilityUseCase({ siteKey: req.params.siteKey, payload: req.body, admin: req.admin }));
  } catch (error) { return next(error); }
};

export const saveExternalListing = async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    return respond(res, await saveExternalListingUseCase({ slug: req.params.slug, payload: req.body, admin: req.admin }));
  } catch (error) { return next(error); }
};

export const setExternalListingVisibility = async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    return respond(res, await setExternalListingVisibilityUseCase({ slug: req.params.slug, payload: req.body, admin: req.admin }));
  } catch (error) { return next(error); }
};

export const removeExternalListing = async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    return respond(res, await removeExternalListingUseCase({ slug: req.params.slug, admin: req.admin }));
  } catch (error) { return next(error); }
};

export const clearTemporaryExternalListings = async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    return respond(res, await clearTemporaryExternalListingsUseCase({ admin: req.admin }));
  } catch (error) { return next(error); }
};
