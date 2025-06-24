/**
 * AI Configuration Service
 * Manages AI model configuration, training data, and custom prompt engineering
 */

import { BaseRepository } from '@/services/database';
import { logger } from '@/utils/logger';
import { ValidationError, ConfigurationError } from '@/utils/errors';
import { AiProvider, AiCapability, AiModelType } from '@/types/ai';

export interface AiModelConfiguration {
  id: string;
  organizationId: string;
  providerId: string;
  name: string;
  displayName: string;
  type: AiModelType;
  isActive: boolean;
  configuration: {
    maxTokens: number;
    temperature: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stopSequences?: string[];
    systemPrompt?: string;
    customInstructions?: string;
  };
  capabilities: AiCapability[];
  costSettings: {
    inputTokenCost: number;
    outputTokenCost: number;
    requestCost?: number;
    dailyBudgetLimit?: number;
    monthlyBudgetLimit?: number;
  };
  performanceSettings: {
    timeoutMs: number;
    maxRetries: number;
    confidenceThreshold: number;
    qualityThreshold: number;
  };
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrainingDataEntry {
  id: string;
  organizationId: string;
  type: 'classification' | 'response' | 'sentiment' | 'entity' | 'custom';
  category: string;
  input: string;
  expectedOutput: string;
  metadata: {
    source?: string;
    confidence?: number;
    verified?: boolean;
    tags?: string[];
    language?: string;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomPromptTemplate {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  type: 'classification' | 'response' | 'analysis' | 'custom';
  template: string;
  variables: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array';
    required: boolean;
    description: string;
    defaultValue?: any;
  }>;
  examples: Array<{
    input: Record<string, any>;
    expectedOutput: string;
  }>;
  isActive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelPerformanceConfig {
  organizationId: string;
  modelId: string;
  accuracyTargets: {
    classification: number;
    sentiment: number;
    entityExtraction: number;
    overall: number;
  };
  qualityTargets: {
    responseRelevance: number;
    customerSatisfaction: number;
    brandCompliance: number;
  };
  costTargets: {
    maxCostPerRequest: number;
    dailyBudget: number;
    monthlyBudget: number;
  };
  alertThresholds: {
    lowAccuracy: number;
    highCost: number;
    slowResponse: number;
    highErrorRate: number;
  };
}

export class AiConfigurationService extends BaseRepository {
  private static instance: AiConfigurationService;

  private constructor() {
    super();
  }

  public static getInstance(): AiConfigurationService {
    if (!AiConfigurationService.instance) {
      AiConfigurationService.instance = new AiConfigurationService();
    }
    return AiConfigurationService.instance;
  }

  // Model Configuration Management
  public async createModelConfiguration(config: Omit<AiModelConfiguration, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    this.validateModelConfiguration(config);

    const id = `model_config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await this.query(`
      INSERT INTO ai_model_configurations (
        id, organization_id, provider_id, name, display_name, type,
        is_active, configuration, capabilities, cost_settings,
        performance_settings, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      id,
      config.organizationId,
      config.providerId,
      config.name,
      config.displayName,
      config.type,
      config.isActive,
      JSON.stringify(config.configuration),
      JSON.stringify(config.capabilities),
      JSON.stringify(config.costSettings),
      JSON.stringify(config.performanceSettings),
      JSON.stringify(config.metadata),
    ]);

    logger.info('Model configuration created', {
      id,
      organizationId: config.organizationId,
      name: config.name,
    });

    return id;
  }

  public async updateModelConfiguration(id: string, updates: Partial<AiModelConfiguration>): Promise<void> {
    const existing = await this.getModelConfiguration(id);
    if (!existing) {
      throw new ConfigurationError('Model configuration not found');
    }

    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (updates.displayName !== undefined) {
      updateFields.push(`display_name = $${paramIndex++}`);
      updateValues.push(updates.displayName);
    }

    if (updates.isActive !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      updateValues.push(updates.isActive);
    }

    if (updates.configuration !== undefined) {
      updateFields.push(`configuration = $${paramIndex++}`);
      updateValues.push(JSON.stringify(updates.configuration));
    }

    if (updates.capabilities !== undefined) {
      updateFields.push(`capabilities = $${paramIndex++}`);
      updateValues.push(JSON.stringify(updates.capabilities));
    }

    if (updates.costSettings !== undefined) {
      updateFields.push(`cost_settings = $${paramIndex++}`);
      updateValues.push(JSON.stringify(updates.costSettings));
    }

    if (updates.performanceSettings !== undefined) {
      updateFields.push(`performance_settings = $${paramIndex++}`);
      updateValues.push(JSON.stringify(updates.performanceSettings));
    }

    if (updates.metadata !== undefined) {
      updateFields.push(`metadata = $${paramIndex++}`);
      updateValues.push(JSON.stringify(updates.metadata));
    }

    if (updateFields.length === 0) {
      return;
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(id);

    await this.query(`
      UPDATE ai_model_configurations 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
    `, updateValues);

    logger.info('Model configuration updated', { id, updates: Object.keys(updates) });
  }

  public async getModelConfiguration(id: string): Promise<AiModelConfiguration | null> {
    const result = await this.query(`
      SELECT 
        id, organization_id as "organizationId", provider_id as "providerId",
        name, display_name as "displayName", type, is_active as "isActive",
        configuration, capabilities, cost_settings as "costSettings",
        performance_settings as "performanceSettings", metadata,
        created_at as "createdAt", updated_at as "updatedAt"
      FROM ai_model_configurations
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapModelConfigurationRow(result.rows[0]);
  }

  public async getModelConfigurations(organizationId: string, filters?: {
    providerId?: string;
    type?: AiModelType;
    isActive?: boolean;
  }): Promise<AiModelConfiguration[]> {
    let query = `
      SELECT 
        id, organization_id as "organizationId", provider_id as "providerId",
        name, display_name as "displayName", type, is_active as "isActive",
        configuration, capabilities, cost_settings as "costSettings",
        performance_settings as "performanceSettings", metadata,
        created_at as "createdAt", updated_at as "updatedAt"
      FROM ai_model_configurations
      WHERE organization_id = $1
    `;

    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (filters?.providerId) {
      query += ` AND provider_id = $${paramIndex++}`;
      params.push(filters.providerId);
    }

    if (filters?.type) {
      query += ` AND type = $${paramIndex++}`;
      params.push(filters.type);
    }

    if (filters?.isActive !== undefined) {
      query += ` AND is_active = $${paramIndex++}`;
      params.push(filters.isActive);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await this.query(query, params);
    return result.rows.map(row => this.mapModelConfigurationRow(row));
  }

  public async deleteModelConfiguration(id: string): Promise<void> {
    await this.query('DELETE FROM ai_model_configurations WHERE id = $1', [id]);
    logger.info('Model configuration deleted', { id });
  }

  // Training Data Management
  public async addTrainingData(data: Omit<TrainingDataEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    this.validateTrainingData(data);

    const id = `training_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await this.query(`
      INSERT INTO ai_training_data (
        id, organization_id, data_type, category, input_text, expected_output,
        metadata, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      id,
      data.organizationId,
      data.type,
      data.category,
      data.input,
      data.expectedOutput,
      JSON.stringify(data.metadata),
      data.isActive,
    ]);

    logger.info('Training data added', {
      id,
      organizationId: data.organizationId,
      type: data.type,
      category: data.category,
    });

    return id;
  }

  public async bulkAddTrainingData(dataEntries: Array<Omit<TrainingDataEntry, 'id' | 'createdAt' | 'updatedAt'>>): Promise<string[]> {
    const ids: string[] = [];

    for (const data of dataEntries) {
      try {
        const id = await this.addTrainingData(data);
        ids.push(id);
      } catch (error) {
        logger.error('Failed to add training data entry', {
          data,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Bulk training data added', {
      total: dataEntries.length,
      successful: ids.length,
      failed: dataEntries.length - ids.length,
    });

    return ids;
  }

  public async getTrainingData(organizationId: string, filters?: {
    type?: string;
    category?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ data: TrainingDataEntry[]; total: number }> {
    let query = `
      SELECT
        id, organization_id as "organizationId", data_type as "type",
        category, input_text as "input", expected_output as "expectedOutput",
        metadata, is_active as "isActive",
        created_at as "createdAt", updated_at as "updatedAt"
      FROM ai_training_data
      WHERE organization_id = $1
    `;

    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (filters?.type) {
      query += ` AND data_type = $${paramIndex++}`;
      params.push(filters.type);
    }

    if (filters?.category) {
      query += ` AND category = $${paramIndex++}`;
      params.push(filters.category);
    }

    if (filters?.isActive !== undefined) {
      query += ` AND is_active = $${paramIndex++}`;
      params.push(filters.isActive);
    }

    // Get total count
    const countResult = await this.query(
      query.replace('SELECT id, organization_id', 'SELECT COUNT(*)'),
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    query += ` ORDER BY created_at DESC`;

    if (filters?.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(filters.limit);
    }

    if (filters?.offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(filters.offset);
    }

    const result = await this.query(query, params);

    return {
      data: result.rows.map(row => this.mapTrainingDataRow(row)),
      total,
    };
  }

  public async updateTrainingData(id: string, updates: Partial<TrainingDataEntry>): Promise<void> {
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (updates.category !== undefined) {
      updateFields.push(`category = $${paramIndex++}`);
      updateValues.push(updates.category);
    }

    if (updates.input !== undefined) {
      updateFields.push(`input_text = $${paramIndex++}`);
      updateValues.push(updates.input);
    }

    if (updates.expectedOutput !== undefined) {
      updateFields.push(`expected_output = $${paramIndex++}`);
      updateValues.push(updates.expectedOutput);
    }

    if (updates.metadata !== undefined) {
      updateFields.push(`metadata = $${paramIndex++}`);
      updateValues.push(JSON.stringify(updates.metadata));
    }

    if (updates.isActive !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      updateValues.push(updates.isActive);
    }

    if (updateFields.length === 0) {
      return;
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(id);

    await this.query(`
      UPDATE ai_training_data
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
    `, updateValues);

    logger.info('Training data updated', { id });
  }

  public async deleteTrainingData(id: string): Promise<void> {
    await this.query('DELETE FROM ai_training_data WHERE id = $1', [id]);
    logger.info('Training data deleted', { id });
  }

  // Custom Prompt Template Management
  public async createPromptTemplate(template: Omit<CustomPromptTemplate, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<string> {
    this.validatePromptTemplate(template);

    const id = `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await this.query(`
      INSERT INTO ai_prompt_templates (
        id, organization_id, name, description, template_type,
        template_content, variables, examples, is_active, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      id,
      template.organizationId,
      template.name,
      template.description,
      template.type,
      template.template,
      JSON.stringify(template.variables),
      JSON.stringify(template.examples),
      template.isActive,
      1, // Initial version
    ]);

    logger.info('Prompt template created', {
      id,
      organizationId: template.organizationId,
      name: template.name,
      type: template.type,
    });

    return id;
  }

  public async updatePromptTemplate(id: string, updates: Partial<CustomPromptTemplate>): Promise<void> {
    const existing = await this.getPromptTemplate(id);
    if (!existing) {
      throw new ConfigurationError('Prompt template not found');
    }

    // Create new version if template content changed
    const isContentChange = updates.template !== undefined ||
                           updates.variables !== undefined ||
                           updates.examples !== undefined;

    const newVersion = isContentChange ? existing.version + 1 : existing.version;

    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      updateValues.push(updates.name);
    }

    if (updates.description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      updateValues.push(updates.description);
    }

    if (updates.template !== undefined) {
      updateFields.push(`template_content = $${paramIndex++}`);
      updateValues.push(updates.template);
    }

    if (updates.variables !== undefined) {
      updateFields.push(`variables = $${paramIndex++}`);
      updateValues.push(JSON.stringify(updates.variables));
    }

    if (updates.examples !== undefined) {
      updateFields.push(`examples = $${paramIndex++}`);
      updateValues.push(JSON.stringify(updates.examples));
    }

    if (updates.isActive !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      updateValues.push(updates.isActive);
    }

    if (isContentChange) {
      updateFields.push(`version = $${paramIndex++}`);
      updateValues.push(newVersion);
    }

    if (updateFields.length === 0) {
      return;
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(id);

    await this.query(`
      UPDATE ai_prompt_templates
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
    `, updateValues);

    logger.info('Prompt template updated', {
      id,
      newVersion: isContentChange ? newVersion : existing.version,
      updates: Object.keys(updates)
    });
  }

  public async getPromptTemplate(id: string): Promise<CustomPromptTemplate | null> {
    const result = await this.query(`
      SELECT
        id, organization_id as "organizationId", name, description,
        template_type as "type", template_content as "template",
        variables, examples, is_active as "isActive", version,
        created_at as "createdAt", updated_at as "updatedAt"
      FROM ai_prompt_templates
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapPromptTemplateRow(result.rows[0]);
  }

  public async getPromptTemplates(organizationId: string, filters?: {
    type?: string;
    isActive?: boolean;
  }): Promise<CustomPromptTemplate[]> {
    let query = `
      SELECT
        id, organization_id as "organizationId", name, description,
        template_type as "type", template_content as "template",
        variables, examples, is_active as "isActive", version,
        created_at as "createdAt", updated_at as "updatedAt"
      FROM ai_prompt_templates
      WHERE organization_id = $1
    `;

    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (filters?.type) {
      query += ` AND template_type = $${paramIndex++}`;
      params.push(filters.type);
    }

    if (filters?.isActive !== undefined) {
      query += ` AND is_active = $${paramIndex++}`;
      params.push(filters.isActive);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await this.query(query, params);
    return result.rows.map(row => this.mapPromptTemplateRow(row));
  }

  public async deletePromptTemplate(id: string): Promise<void> {
    await this.query('DELETE FROM ai_prompt_templates WHERE id = $1', [id]);
    logger.info('Prompt template deleted', { id });
  }

  public async renderPromptTemplate(id: string, variables: Record<string, any>): Promise<string> {
    const template = await this.getPromptTemplate(id);
    if (!template) {
      throw new ConfigurationError('Prompt template not found');
    }

    if (!template.isActive) {
      throw new ConfigurationError('Prompt template is not active');
    }

    // Validate required variables
    const requiredVars = template.variables.filter(v => v.required);
    const missingVars = requiredVars.filter(v => !(v.name in variables));

    if (missingVars.length > 0) {
      throw new ValidationError(`Missing required variables: ${missingVars.map(v => v.name).join(', ')}`);
    }

    // Render template with variables
    let rendered = template.template;

    for (const variable of template.variables) {
      const value = variables[variable.name] ?? variable.defaultValue;
      const placeholder = `{{${variable.name}}}`;

      if (value !== undefined) {
        rendered = rendered.replace(new RegExp(placeholder, 'g'), String(value));
      }
    }

    return rendered;
  }

  // Performance Configuration Management
  public async setPerformanceConfig(config: ModelPerformanceConfig): Promise<void> {
    await this.query(`
      INSERT INTO ai_performance_configs (
        organization_id, model_id, accuracy_targets, quality_targets,
        cost_targets, alert_thresholds
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (organization_id, model_id)
      DO UPDATE SET
        accuracy_targets = EXCLUDED.accuracy_targets,
        quality_targets = EXCLUDED.quality_targets,
        cost_targets = EXCLUDED.cost_targets,
        alert_thresholds = EXCLUDED.alert_thresholds,
        updated_at = NOW()
    `, [
      config.organizationId,
      config.modelId,
      JSON.stringify(config.accuracyTargets),
      JSON.stringify(config.qualityTargets),
      JSON.stringify(config.costTargets),
      JSON.stringify(config.alertThresholds),
    ]);

    logger.info('Performance config set', {
      organizationId: config.organizationId,
      modelId: config.modelId,
    });
  }

  public async getPerformanceConfig(organizationId: string, modelId: string): Promise<ModelPerformanceConfig | null> {
    const result = await this.query(`
      SELECT
        organization_id as "organizationId", model_id as "modelId",
        accuracy_targets as "accuracyTargets", quality_targets as "qualityTargets",
        cost_targets as "costTargets", alert_thresholds as "alertThresholds"
      FROM ai_performance_configs
      WHERE organization_id = $1 AND model_id = $2
    `, [organizationId, modelId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      organizationId: row.organizationId,
      modelId: row.modelId,
      accuracyTargets: row.accuracyTargets,
      qualityTargets: row.qualityTargets,
      costTargets: row.costTargets,
      alertThresholds: row.alertThresholds,
    };
  }

  // Validation Methods
  private validateModelConfiguration(config: Omit<AiModelConfiguration, 'id' | 'createdAt' | 'updatedAt'>): void {
    if (!config.organizationId) {
      throw new ValidationError('organizationId is required');
    }
    if (!config.providerId) {
      throw new ValidationError('providerId is required');
    }
    if (!config.name || config.name.trim().length === 0) {
      throw new ValidationError('name is required');
    }
    if (!config.displayName || config.displayName.trim().length === 0) {
      throw new ValidationError('displayName is required');
    }
    if (!config.type) {
      throw new ValidationError('type is required');
    }
    if (!config.configuration) {
      throw new ValidationError('configuration is required');
    }
    if (config.configuration.maxTokens <= 0) {
      throw new ValidationError('maxTokens must be positive');
    }
    if (config.configuration.temperature < 0 || config.configuration.temperature > 2) {
      throw new ValidationError('temperature must be between 0 and 2');
    }
  }

  private validateTrainingData(data: Omit<TrainingDataEntry, 'id' | 'createdAt' | 'updatedAt'>): void {
    if (!data.organizationId) {
      throw new ValidationError('organizationId is required');
    }
    if (!data.type) {
      throw new ValidationError('type is required');
    }
    if (!data.category || data.category.trim().length === 0) {
      throw new ValidationError('category is required');
    }
    if (!data.input || data.input.trim().length === 0) {
      throw new ValidationError('input is required');
    }
    if (!data.expectedOutput || data.expectedOutput.trim().length === 0) {
      throw new ValidationError('expectedOutput is required');
    }
  }

  private validatePromptTemplate(template: Omit<CustomPromptTemplate, 'id' | 'version' | 'createdAt' | 'updatedAt'>): void {
    if (!template.organizationId) {
      throw new ValidationError('organizationId is required');
    }
    if (!template.name || template.name.trim().length === 0) {
      throw new ValidationError('name is required');
    }
    if (!template.template || template.template.trim().length === 0) {
      throw new ValidationError('template is required');
    }
    if (!template.type) {
      throw new ValidationError('type is required');
    }

    // Validate variables
    for (const variable of template.variables) {
      if (!variable.name || variable.name.trim().length === 0) {
        throw new ValidationError('Variable name is required');
      }
      if (!variable.type) {
        throw new ValidationError('Variable type is required');
      }
    }

    // Check for template variable consistency
    const templateVars = this.extractTemplateVariables(template.template);
    const definedVars = template.variables.map(v => v.name);
    const undefinedVars = templateVars.filter(v => !definedVars.includes(v));

    if (undefinedVars.length > 0) {
      throw new ValidationError(`Template uses undefined variables: ${undefinedVars.join(', ')}`);
    }
  }

  private extractTemplateVariables(template: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const variables: string[] = [];
    let match;

    while ((match = regex.exec(template)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    return variables;
  }

  // Mapping Methods
  private mapModelConfigurationRow(row: any): AiModelConfiguration {
    return {
      id: row.id,
      organizationId: row.organizationId,
      providerId: row.providerId,
      name: row.name,
      displayName: row.displayName,
      type: row.type,
      isActive: row.isActive,
      configuration: row.configuration,
      capabilities: row.capabilities,
      costSettings: row.costSettings,
      performanceSettings: row.performanceSettings,
      metadata: row.metadata || {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapTrainingDataRow(row: any): TrainingDataEntry {
    return {
      id: row.id,
      organizationId: row.organizationId,
      type: row.type,
      category: row.category,
      input: row.input,
      expectedOutput: row.expectedOutput,
      metadata: row.metadata || {},
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapPromptTemplateRow(row: any): CustomPromptTemplate {
    return {
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      description: row.description,
      type: row.type,
      template: row.template,
      variables: row.variables || [],
      examples: row.examples || [],
      isActive: row.isActive,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

// Export singleton instance
export const aiConfigurationService = AiConfigurationService.getInstance();
export default AiConfigurationService;
