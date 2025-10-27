
import express from 'express';
import {
  createContribution,
  getContributionsByFund,
  getContributionsByContributor,
  getUserFundContribution,
  getMyShares
} from '../controllers/contributionController';

const router = express.Router();

router.post('/', createContribution);
router.get('/contributions/fund', getContributionsByFund);
router.get('/contributions/user', getContributionsByContributor);
router.get('/myshares', getMyShares);
router.get('/contributions/:groupId', getUserFundContribution);

export default router;
