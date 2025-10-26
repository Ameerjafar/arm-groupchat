import express from 'express';
import {
  createTransaction,
  updateTransactionStatus,
  getTransactionsByFund,
  getTransactionBySignature,
} from '../controllers/transactionController';

const transactionRoute = express.Router();
transactionRoute.post('/', createTransaction);
transactionRoute.get('/fund/:fundId', getTransactionsByFund);
transactionRoute.get('/:signature', getTransactionBySignature);
transactionRoute.patch('/:signature/status', updateTransactionStatus);

export default transactionRoute;
