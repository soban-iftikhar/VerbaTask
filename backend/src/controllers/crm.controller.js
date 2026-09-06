import InventoryItem from '../models/InventoryItem.js';
import Order from '../models/Order.js';
import { createOrder as processOrderCommand } from '../crm/order.service.js';
import Merchant from '../models/Merchant.js';
import { uploadMedia } from '../services/media.service.js';
import { sendDocumentMessage } from '../services/whatsapp.service.js';
import { emitDashboardUpdate } from '../socket.js';
import {
  generateInventoryReport,
  generateLowStockReport,
  generateExpiringReport,
  generateSalesReport,
  generateTopSellingReport
} from '../services/report.service.js';

// Escape regex metacharacters in item names — same reason as order.service.js.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// --- INVENTORY CRUD ---

export const getInventory = async (req, res) => {
    try {
        const items = await InventoryItem.find({ merchantId: req.merchantId });
        res.status(200).json({ success: true, data: items });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
    }
};

export const createInventoryItem = async (req, res) => {
    try {
        const { name, quantity, price, unit, expiryDates } = req.body;

        // 1. Check if this merchant already has an item with this exact name (case-insensitive)
        let item = await InventoryItem.findOne({
            merchantId: req.merchantId,
            name: new RegExp(`^${escapeRegex(name)}$`, 'i') // "Daal channa" will match "daal channa"
        });

        if (item) {
            // 2. Item exists: Add the new stock to the existing stock
            item.quantity += (quantity || 0);
            
            // Optionally update price and unit if new ones were provided
            if (price) item.price = price;
            if (unit) item.unit = unit;
            if (expiryDates && Array.isArray(expiryDates)) {
                item.expiryDates = [...new Set([...item.expiryDates, ...expiryDates])];
            }
            
            await item.save();
            emitDashboardUpdate(req.merchantId, { type: 'inventory', action: 'update', itemId: item._id, itemName: item.name });
            return res.status(200).json({ success: true, data: item });
        }

        // 3. Item does not exist: Create a brand new entry
        item = await InventoryItem.create({
            merchantId: req.merchantId,
            name,
            quantity: quantity || 0,
            price,
            unit,
            expiryDates: Array.isArray(expiryDates) ? expiryDates : []
        });

        emitDashboardUpdate(req.merchantId, { type: 'inventory', action: 'create', itemId: item._id, itemName: item.name });
        res.status(201).json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
    }
};

export const updateInventoryItem = async (req, res) => {
    try {
        const item = await InventoryItem.findOneAndUpdate(
            { _id: req.params.id, merchantId: req.merchantId },
            req.body,
            { new: true }
        );
        if (!item) return res.status(404).json({ success: false, error: { message: 'Item not found' } });
        emitDashboardUpdate(req.merchantId, { type: 'inventory', action: 'update', itemId: item._id, itemName: item.name });
        res.status(200).json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
    }
};

export const deleteInventoryItem = async (req, res) => {
    try {
        const item = await InventoryItem.findOneAndDelete({ _id: req.params.id, merchantId: req.merchantId });
        if (!item) return res.status(404).json({ success: false, error: { message: 'Item not found' } });
        emitDashboardUpdate(req.merchantId, { type: 'inventory', action: 'delete', itemId: req.params.id });
        res.status(200).json({ success: true, data: { deleted: true } });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
    }
};

// --- ORDERS ---

export const getOrders = async (req, res) => {
    try {
        const orders = await Order.find({ merchantId: req.merchantId }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
    }
};

export const getOrderById = async (req, res) => {
    try {
        const order = await Order.findOne({ _id: req.params.id, merchantId: req.merchantId });
        if (!order) return res.status(404).json({ success: false, error: { message: 'Order not found' } });
        res.status(200).json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
    }
};

export const createOrder = async (req, res) => {
    try {
        // Enforce the command contract shape from HTTP body
        const command = {
            ...req.body,
            merchantId: req.merchantId 
        };
        
        const order = await processOrderCommand(command);
        res.status(201).json({ success: true, data: order });
    } catch (error) {
        // Distinguish between bad user input (400) and server errors (500)
        const status = error.message.includes('ITEM_NOT_FOUND') || error.message.includes('INSUFFICIENT_STOCK') ? 400 : 500;
        res.status(status).json({ success: false, error: { message: error.message } });
    }
};

export const sendReportToWhatsapp = async (req, res) => {
    try {
        const merchant = await Merchant.findById(req.merchantId);
        if (!merchant) {
            return res.status(404).json({ success: false, error: { message: 'Merchant not found' } });
        }

        const { reportType } = req.body;
        let report;

        switch (reportType) {
            case 'low_stock':
                report = await generateLowStockReport(merchant);
                break;
            case 'top_selling':
                report = await generateTopSellingReport(merchant);
                break;
            case 'expiring':
                report = await generateExpiringReport(merchant);
                break;
            case 'sales':
                report = await generateSalesReport(merchant);
                break;
            case 'inventory':
            default:
                report = await generateInventoryReport(merchant);
                break;
        }

        const { id: mediaId } = await uploadMedia(report.buffer, 'application/pdf', report.filename);
        
        await sendDocumentMessage(
            merchant.whatsappNumber,
            mediaId,
            report.filename,
            merchant.language === 'en' ? 'Here is your requested report! 📄' : 'یہ رہی آپ کی رپورٹ! 📄'
        );

        res.status(200).json({ success: true, message: 'Report sent to WhatsApp' });
    } catch (error) {
        console.error('sendReportToWhatsapp failed:', error);
        res.status(500).json({ success: false, error: { message: error.message } });
    }
};