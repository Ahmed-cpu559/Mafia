// src/utils/API.Feature.js
import { Op } from "sequelize";

export class ApiFeatureSequelize {
  // Configuration
  static DEFAULT_PAGE = 1;
  static DEFAULT_LIMIT = 50;
  static MAX_LIMIT = 200;

  static RESERVED_QUERY_PARAMS = new Set(["page", "limit", "fields", "sort", "search", "rangeStart", "rangeEnd"]);

  static EXCLUDED_FIELDS = new Set(["password", "refreshToken", "passwordResetToken", "passwordResetExpires", "otp"]);

  static OPERATOR_MAP = {
    gte: Op.gte,
    gt: Op.gt,
    lte: Op.lte,
    lt: Op.lt,
    in: Op.in,
    ne: Op.ne,
    between: Op.between,
    like: Op.like,
    notLike: Op.notLike,
    is: Op.is,
    not: Op.not,
    contains: Op.contains,
    startsWith: Op.startsWith,
    endsWith: Op.endsWith
  };

  static OPERATOR_NAMES = new Set(Object.keys(ApiFeatureSequelize.OPERATOR_MAP));

  // Constructor
  constructor(model, urlQuery = {}) {
    if (!model) {
      throw new Error("[API_FEATURE] A Sequelize model is required.");
    }

    this.model = model;
    this.urlQuery = { ...urlQuery };

    this.options = { where: {} };

    this._filters = {};
    this._searchApplied = false;

    this.responseDetails = {
      filters: {},
      sortedBy: null,
      fields: null,
      searchedBy: null,

      totalCount: 0,
      filteredCount: 0,
      returnedCount: 0,

      pagination: {
        currentPage: ApiFeatureSequelize.DEFAULT_PAGE,
        pageSize: ApiFeatureSequelize.DEFAULT_LIMIT,

        totalPages: 0,

        hasNextPage: false,
        hasPrevPage: false,

        nextPage: null,
        prevPage: null,

        pagesRemaining: 0,
        itemsRemaining: 0,

        startIndex: 0,
        endIndex: 0,

        rangeStart: null,
        rangeEnd: null,
        isRangeMode: false
      }
    };
  }

  _getModelAttributes() {
    return Object.keys(this.model?.rawAttributes || {});
  }

  _getPrimaryKey() {
    return this.model?.primaryKeyAttribute || this.model?.primaryKeyAttributes?.[0] || "id";
  }

  _isValidField(field) {
    if (!field || typeof field !== "string") {
      return false;
    }

    return this._getModelAttributes().includes(field);
  }

  _isAllowedField(field) {
    return this._isValidField(field) && !ApiFeatureSequelize.EXCLUDED_FIELDS.has(field);
  }

  _parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  _escapeLikeValue(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  }

  _isOperatorName(value) {
    return typeof value === "string" && ApiFeatureSequelize.OPERATOR_NAMES.has(value);
  }

  _parseOperatorKey(key) {
    if (typeof key !== "string") {
      return null;
    }

    const match = key.match(/^(.*)\[(gte|gt|lte|lt|in|ne|between|like|notLike|is|not|contains|startsWith|endsWith)\]$/);

    if (!match) {
      return null;
    }

    return { field: match[1], operator: match[2] };
  }

  _parseInValue(value) {
    const values = Array.isArray(value) ? value.flatMap((item) => String(item).split(",")) : String(value).split(",");

    return values.map((item) => item.trim()).filter(Boolean);
  }

  _parseBetweenValue(value) {
    const values = Array.isArray(value) ? value.flatMap((item) => String(item).split(",")) : String(value).split(",");

    const normalizedValues = values.map((item) => item.trim()).filter(Boolean);

    return normalizedValues.length === 2 ? normalizedValues : null;
  }

  _parseOperatorValue(operator, rawValue) {
    let value = rawValue;

    if (operator === "in") {
      value = this._parseInValue(rawValue);

      return value.length ? value : null;
    }

    if (operator === "between") {
      return this._parseBetweenValue(rawValue);
    }

    if (operator === "is") {
      const normalizedValue = String(rawValue).toLowerCase();

      if (normalizedValue === "null") {
        return null;
      }

      if (normalizedValue === "true") {
        return true;
      }

      if (normalizedValue === "false") {
        return false;
      }

      return rawValue;
    }

    if (operator === "contains" || operator === "startsWith" || operator === "endsWith") {
      const escapedValue = this._escapeLikeValue(rawValue);

      if (operator === "contains") {
        return `%${escapedValue}%`;
      }

      if (operator === "startsWith") {
        return `${escapedValue}%`;
      }

      return `%${escapedValue}`;
    }

    if (operator === "like" || operator === "notLike") {
      return `%${this._escapeLikeValue(rawValue)}%`;
    }

    return value;
  }

  _cloneFilterForResponse(value) {
    if (Array.isArray(value)) {
      return value.map((item) => this._cloneFilterForResponse(item));
    }

    if (value && typeof value === "object") {
      const result = {};

      for (const [key, item] of Object.entries(value)) {
        result[key] = this._cloneFilterForResponse(item);
      }

      return result;
    }

    return value;
  }

  _setFieldOperator(field, operator, rawValue) {
    if (!this._isAllowedField(field)) {
      return;
    }

    const sequelizeOperator = ApiFeatureSequelize.OPERATOR_MAP[operator];

    if (!sequelizeOperator) {
      return;
    }

    const value = this._parseOperatorValue(operator, rawValue);

    if (value === null && operator !== "is") {
      return;
    }

    const currentFilter = this.options.where[field];

    if (currentFilter && typeof currentFilter === "object" && !Array.isArray(currentFilter)) {
      this.options.where[field] = { ...currentFilter, [sequelizeOperator]: value };

      return;
    }

    this.options.where[field] = { [sequelizeOperator]: value };
  }

  _applyOperatorFilter(field, operator, rawValue) {
    if (!this._isAllowedField(field)) {
      return;
    }

    if (!this._isOperatorName(operator)) {
      return;
    }

    this._setFieldOperator(field, operator, rawValue);
  }

  // FILTER
  filter() {
    const filters = { ...this.urlQuery };

    // Remove Reserved Parameters

    for (const param of ApiFeatureSequelize.RESERVED_QUERY_PARAMS) {
      delete filters[param];
    }

    // Apply Filters
    for (const [key, rawValue] of Object.entries(filters)) {
      if (rawValue === undefined || rawValue === null || rawValue === "") {
        continue;
      }

      const parsedOperator = this._parseOperatorKey(key);

      if (parsedOperator) {
        this._applyOperatorFilter(parsedOperator.field, parsedOperator.operator, rawValue);

        continue;
      }

      if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
        const nestedKeys = Object.keys(rawValue);

        const hasOperators = nestedKeys.some((nestedKey) => this._isOperatorName(nestedKey));

        if (hasOperators) {
          for (const nestedKey of nestedKeys) {
            if (!this._isOperatorName(nestedKey)) {
              continue;
            }

            const nestedValue = rawValue[nestedKey];

            if (nestedValue === undefined || nestedValue === null || nestedValue === "") {
              continue;
            }

            this._applyOperatorFilter(key, nestedKey, nestedValue);
          }

          continue;
        }
      }

      if (!this._isAllowedField(key)) {
        continue;
      }

      this.options.where[key] = rawValue;
    }

    // Response Metadata
    this._filters = this._cloneFilterForResponse(this.options.where);
    this.responseDetails.filters = this._filters;

    return this;
  }

  // SORT
  sort() {
    const primaryKey = this._getPrimaryKey();

    const fallbackSort = this._isValidField("createdAt") ? [["createdAt", "DESC"]] : [[primaryKey, "DESC"]];

    // Default Sort
    if (!this.urlQuery.sort) {
      this.options.order = fallbackSort;
      this.responseDetails.sortedBy = this._isValidField("createdAt") ? "createdAt:DESC" : `${primaryKey}:DESC`;

      return this;
    }

    // Requested Sort
    const sortItems = String(this.urlQuery.sort)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const orders = [];

    for (const item of sortItems) {
      const [field, direction = "ASC"] = item.split(":");
      if (!this._isValidField(field)) {
        continue;
      }
      const normalizedDirection = direction.toUpperCase();
      if (!["ASC", "DESC"].includes(normalizedDirection)) {
        continue;
      }
      orders.push([field, normalizedDirection]);
    }

    // Apply Sort
    this.options.order = orders.length > 0 ? orders : fallbackSort;
    this.responseDetails.sortedBy = this.options.order.map(([field, direction]) => `${field}:${direction}`).join(",");

    return this;
  }

  // SELECT / FIELDS
  select() {
    const primaryKey = this._getPrimaryKey();

    // No Fields Requested
    if (!this.urlQuery.fields) {
      this.options.attributes = { exclude: [...ApiFeatureSequelize.EXCLUDED_FIELDS].filter((field) => this._isValidField(field)) };

      this.responseDetails.fields = null;

      return this;
    }

    // Parse Requested Fields
    const requestedFields = String(this.urlQuery.fields)
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean);

    // Validate Fields
    const fields = [...new Set(requestedFields.filter((field) => this._isAllowedField(field)))];

    // Always Include Primary Key
    if (this._isAllowedField(primaryKey) && !fields.includes(primaryKey)) {
      fields.unshift(primaryKey);
    }

    // No Valid Fields
    if (!fields.length) {
      this.options.attributes = { exclude: [...ApiFeatureSequelize.EXCLUDED_FIELDS].filter((field) => this._isValidField(field)) };

      this.responseDetails.fields = null;

      return this;
    }

    // Apply Attributes
    this.options.attributes = fields;

    this.responseDetails.fields = [...fields];

    return this;
  }

  // SEARCH
  search(fields = ["title", "content"]) {
    if (!this.urlQuery.search) {
      return this;
    }

    const term = String(this.urlQuery.search).trim();

    if (!term) {
      return this;
    }

    const validFields = fields.filter((field) => this._isAllowedField(field));

    if (!validFields.length) {
      return this;
    }

    const escapedTerm = this._escapeLikeValue(term);

    const searchConditions = validFields.map((field) => ({ [field]: { [Op.like]: `%${escapedTerm}%` } }));

    if (Object.keys(this.options.where).length > 0) {
      this.options.where = { [Op.and]: [this.options.where, { [Op.or]: searchConditions }] };
    } else {
      this.options.where = { [Op.or]: searchConditions };
    }

    this._searchApplied = true;

    this.responseDetails.searchedBy = { term, fields: validFields };

    return this;
  }

  // PAGINATION
  pagination() {
    const page = this._parsePositiveInteger(this.urlQuery.page, ApiFeatureSequelize.DEFAULT_PAGE);

    let limit = this._parsePositiveInteger(this.urlQuery.limit, ApiFeatureSequelize.DEFAULT_LIMIT);

    limit = Math.min(limit, ApiFeatureSequelize.MAX_LIMIT);

    const rangeStart = Number.parseInt(this.urlQuery.rangeStart, 10);

    const rangeEnd = Number.parseInt(this.urlQuery.rangeEnd, 10);

    const isValidRange = Number.isInteger(rangeStart) && Number.isInteger(rangeEnd) && rangeStart >= 1 && rangeEnd >= rangeStart;

    // Range Mode
    if (isValidRange) {
      const offset = rangeStart - 1;

      const actualLimit = rangeEnd - rangeStart + 1;

      this.options.offset = offset;

      this.options.limit = actualLimit;

      this.responseDetails.pagination = {
        ...this.responseDetails.pagination,

        currentPage: null,
        pageSize: actualLimit,

        rangeStart,
        rangeEnd,

        isRangeMode: true,

        startIndex: rangeStart,
        endIndex: rangeEnd
      };

      return this;
    }

    // Normal Pagination
    const offset = (page - 1) * limit;

    this.options.offset = offset;

    this.options.limit = limit;

    this.responseDetails.pagination = {
      ...this.responseDetails.pagination,

      currentPage: page,
      pageSize: limit,

      rangeStart: null,
      rangeEnd: null,

      isRangeMode: false,

      startIndex: offset + 1,
      endIndex: offset + limit
    };

    return this;
  }

  // COUNT
  async getCorrectCount() {
    const countOptions = { where: this.options.where || {}, distinct: true };

    if (this.options.include) {
      countOptions.include = this.options.include.map((include) => ({ ...include, attributes: [] }));
    }
    return this.model.count(countOptions);
  }

  // EXECUTE
  async exec() {
    try {
      // Total Records
      const totalCount = await this.model.count({ distinct: true });

      // Filtered Records
      const filteredCount = await this.getCorrectCount();

      // Main Query
      const result = await this.model.findAll(this.options);
      const returnedCount = result.length;

      // Response Details
      this.responseDetails.totalCount = totalCount;
      this.responseDetails.filteredCount = filteredCount;

      this.responseDetails.returnedCount = returnedCount;

      const pagination = this.responseDetails.pagination;

      // Range Mode
      if (pagination.isRangeMode) {
        const { rangeStart, rangeEnd } = pagination;

        const actualEndIndex = Math.min(rangeEnd, filteredCount);

        const hasResults = filteredCount > 0 && rangeStart <= filteredCount;

        this.responseDetails.pagination = {
          ...pagination,

          totalPages: null,

          hasNextPage: null,
          hasPrevPage: null,

          nextPage: null,
          prevPage: null,

          pagesRemaining: null,

          itemsRemaining: Math.max(0, filteredCount - actualEndIndex),

          startIndex: hasResults ? rangeStart : 0,

          endIndex: actualEndIndex,

          message: hasResults ? `Showing items ${rangeStart} to ${actualEndIndex} of ${filteredCount} total` : "No items found"
        };
      }

      // Normal Pagination
      else {
        const { pageSize, currentPage } = pagination;

        const totalPages = filteredCount > 0 ? Math.ceil(filteredCount / pageSize) : 0;

        const hasNextPage = currentPage < totalPages;

        const hasPrevPage = currentPage > 1 && totalPages > 0;

        const startIndex = filteredCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;

        const endIndex = filteredCount === 0 ? 0 : Math.min(currentPage * pageSize, filteredCount);

        const itemsShown = filteredCount === 0 ? 0 : Math.min(currentPage * pageSize, filteredCount);

        const itemsRemaining = Math.max(0, filteredCount - itemsShown);

        const pagesRemaining = Math.max(0, totalPages - currentPage);

        this.responseDetails.pagination = {
          ...pagination,

          totalPages,

          hasNextPage,
          hasPrevPage,

          nextPage: hasNextPage ? currentPage + 1 : null,

          prevPage: hasPrevPage ? currentPage - 1 : null,

          pagesRemaining,
          itemsRemaining,

          startIndex,
          endIndex
        };
      }

      // Final Response
      return { success: true, data: result, responseDetails: this.responseDetails };
    } catch (error) {
      console.error("[API_FEATURE] Database query failed:", error);
      throw error;
    }
  }

  // QUICK STATS
  async getQuickStats() {
    try {
      const totalRecords = await this.model.count();
      const matchingRecords = await this.getCorrectCount();
      return { totalRecords, matchingRecords, filters: this._filters, searchTerm: this.responseDetails.searchedBy?.term || null };
    } catch (error) {
      console.error("[API_FEATURE] Failed to get quick stats:", error);

      throw error;
    }
  }
}
