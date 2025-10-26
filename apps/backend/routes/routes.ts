import express from 'express';
import { groupRoute } from './groupRoute'
import { userRoute } from './userRoute';
import tradeRoute from './tradeRoute';
import walletRoute from './walletRoute';

export const routes = express.Router();


routes.use('/group', groupRoute);

routes.use('/user', userRoute);

routes.use('/trade',tradeRoute)

routes.use('/wallet',walletRoute)