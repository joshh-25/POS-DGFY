import { listRegistrationIndustriesUseCase } from '../index.js';

// Public read (no auth) - all three signup surfaces need this before a DGFY
// account/tenant exists, and the catalog itself is non-sensitive marketing
// content. Errors are never expected here (the use case degrades internally
// rather than throwing), but next(error) is kept for the same reason every
// other handler in this codebase keeps it: a genuinely unexpected failure
// should 500 through the standard error pipeline, not crash the process.
export const listRegistrationIndustries = async (req, res, next) => {
    try {
        const industries = await listRegistrationIndustriesUseCase();
        return res.status(200).json({ success: true, data: { industries }, message: null });
    } catch (error) {
        next(error);
    }
};
