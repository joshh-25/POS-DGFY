import './config/env.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
// Phase 10 (10-08-PLAN.md, T-10-08-04): stash the raw request body via
// express.json()'s `verify` callback so the PayMongo webhook route can
// verify an HMAC signature over the EXACT bytes PayMongo signed, before any
// parsing/DB work — while every other route keeps using the normal parsed
// `req.body` unaffected (least-invasive; editing apps/dgfy-api is
// permitted, only backend/ is off-limits).
app.use(express.json({
    verify: (req, _res, buf) => {
        req.rawBody = buf;
    }
}));

app.use('/v1', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
