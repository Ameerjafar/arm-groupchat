
import express from 'express';
import {
  createContribution,
  getContributionsByFund,
  getContributionsByContributor,
} from '../controllers/contributionController';

const contributionRoute = express.Router();
contributionRoute.post('/', createContribution);
contributionRoute.get('/contribution/:fundId', getContributionsByFund);
contributionRoute.get('/contributor/:contributorId', getContributionsByContributor);

export default contributionRoute;
