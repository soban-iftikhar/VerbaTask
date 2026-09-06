import * as workflowService from '../workflows/workflow.service.js';
import { emitDashboardUpdate } from '../socket.js';

export const listWorkflows = async (req, res) => {
  try {
    const workflows = await workflowService.listWorkflows(req.merchantId);
    res.status(200).json({ success: true, data: workflows });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
};

export const createWorkflow = async (req, res) => {
  try {
    const workflow = await workflowService.createWorkflow({
      ...req.body,
      merchantId: req.merchantId,
    });
    emitDashboardUpdate(req.merchantId, { type: 'workflow', action: 'create' });
    res.status(201).json({ success: true, data: workflow });
  } catch (error) {
    res.status(400).json({ success: false, error: { message: error.message } });
  }
};

export const updateWorkflow = async (req, res) => {
  try {
    const workflow = await workflowService.updateWorkflow(
      req.params.id,
      req.merchantId,
      req.body
    );
    emitDashboardUpdate(req.merchantId, { type: 'workflow', action: 'update' });
    res.status(200).json({ success: true, data: workflow });
  } catch (error) {
    const status = error.message.includes('NOT_FOUND') ? 404 : 400;
    res.status(status).json({ success: false, error: { message: error.message } });
  }
};

export const deleteWorkflow = async (req, res) => {
  try {
    const workflow = await workflowService.deleteWorkflow(req.params.id, req.merchantId);
    emitDashboardUpdate(req.merchantId, { type: 'workflow', action: 'delete' });
    res.status(200).json({ success: true, data: workflow });
  } catch (error) {
    const status = error.message.includes('NOT_FOUND') ? 404 : 500;
    res.status(status).json({ success: false, error: { message: error.message } });
  }
};
