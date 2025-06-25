/**
 * Compliance Service Tests
 * Tests for GDPR, HIPAA, SOC 2, and PCI DSS compliance
 */

import { ComplianceService, DataProcessingRecord, ConsentRecord } from '../services/compliance-service';

describe('Compliance Service', () => {
  let complianceService: ComplianceService;
  const testOrgId = 'test_org_123';
  const testDataSubjectId = 'test_subject_456';

  beforeAll(async () => {
    complianceService = new ComplianceService();
  });

  afterAll(async () => {
    // Cleanup
  });

  describe('GDPR Compliance', () => {
    it('should record data processing activity (Article 30)', async () => {
      const processingRecord = {
        organizationId: testOrgId,
        dataType: 'customer_personal_data',
        purpose: 'Service delivery and customer support',
        legalBasis: 'contract',
        dataSubjects: ['customers', 'prospects'],
        categories: ['contact_information', 'transaction_data'],
        recipients: ['internal_staff', 'payment_processors'],
        transfers: [
          {
            country: 'US',
            safeguards: 'Standard Contractual Clauses',
            date: new Date(),
          },
        ],
        retention: {
          period: '7 years',
          criteria: 'Contract termination + 7 years',
        },
        securityMeasures: ['encryption', 'access_controls', 'audit_logging'],
        dataProtectionOfficer: 'dpo@company.com',
      };

      const record = await complianceService.recordDataProcessing(processingRecord);

      expect(record).toMatchObject({
        id: expect.any(String),
        organizationId: testOrgId,
        dataType: 'customer_personal_data',
        purpose: 'Service delivery and customer support',
        legalBasis: 'contract',
        lastUpdated: expect.any(Date),
      });

      expect(record.id).toMatch(/^dpr_/);
    });

    it('should record consent (Article 7)', async () => {
      const consentData = {
        dataSubjectId: testDataSubjectId,
        organizationId: testOrgId,
        purpose: 'Marketing communications',
        dataTypes: ['email', 'preferences'],
        consentGiven: new Date(),
        method: 'explicit' as const,
        evidence: 'Checkbox consent on registration form with timestamp',
        status: 'active' as const,
      };

      const consent = await complianceService.recordConsent(consentData);

      expect(consent).toMatchObject({
        id: expect.any(String),
        dataSubjectId: testDataSubjectId,
        organizationId: testOrgId,
        purpose: 'Marketing communications',
        method: 'explicit',
        status: 'active',
      });

      expect(consent.id).toMatch(/^consent_/);
    });

    it('should handle data subject access request (Article 15)', async () => {
      const request = {
        type: 'access' as const,
        dataSubjectId: testDataSubjectId,
        organizationId: testOrgId,
        details: 'Request for all personal data held by the organization',
        verificationMethod: 'government_id_verification',
      };

      const response = await complianceService.handleDataSubjectRequest(request);

      expect(response).toMatchObject({
        requestId: expect.any(String),
        status: 'received',
        dueDate: expect.any(Date),
      });

      expect(response.requestId).toMatch(/^dsr_/);
      
      // Due date should be within 30 days (GDPR requirement)
      const daysDiff = Math.ceil((response.dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBeLessThanOrEqual(30);
    });

    it('should handle data subject erasure request (Article 17)', async () => {
      const request = {
        type: 'erasure' as const,
        dataSubjectId: testDataSubjectId,
        organizationId: testOrgId,
        details: 'Request to delete all personal data',
        verificationMethod: 'email_verification',
      };

      const response = await complianceService.handleDataSubjectRequest(request);

      expect(response).toMatchObject({
        requestId: expect.any(String),
        status: 'received',
        dueDate: expect.any(Date),
        response: expect.objectContaining({
          message: expect.any(String),
        }),
      });
    });

    it('should handle data portability request (Article 20)', async () => {
      const request = {
        type: 'portability' as const,
        dataSubjectId: testDataSubjectId,
        organizationId: testOrgId,
        details: 'Request for data in machine-readable format',
        verificationMethod: 'two_factor_authentication',
      };

      const response = await complianceService.handleDataSubjectRequest(request);

      expect(response).toMatchObject({
        requestId: expect.any(String),
        status: 'received',
        dueDate: expect.any(Date),
      });
    });

    it('should get GDPR compliance status', async () => {
      const status = await complianceService.getComplianceStatus(testOrgId, 'gdpr_2018');

      expect(status).toMatchObject({
        overall: expect.any(Number),
        frameworks: expect.arrayContaining([
          expect.objectContaining({
            id: 'gdpr_2018',
            name: expect.any(String),
            score: expect.any(Number),
            status: expect.stringMatching(/^(compliant|non_compliant|in_progress)$/),
            lastAudit: expect.any(Date),
            nextAudit: expect.any(Date),
            criticalFindings: expect.any(Number),
          }),
        ]),
      });

      expect(status.overall).toBeGreaterThanOrEqual(0);
      expect(status.overall).toBeLessThanOrEqual(100);
    });
  });

  describe('HIPAA Compliance', () => {
    it('should get HIPAA compliance status', async () => {
      const status = await complianceService.getComplianceStatus(testOrgId, 'hipaa_1996');

      expect(status).toMatchObject({
        overall: expect.any(Number),
        frameworks: expect.arrayContaining([
          expect.objectContaining({
            id: 'hipaa_1996',
            name: expect.stringContaining('HIPAA'),
            score: expect.any(Number),
            status: expect.stringMatching(/^(compliant|non_compliant|in_progress)$/),
          }),
        ]),
      });
    });

    it('should conduct HIPAA audit', async () => {
      const audit = await complianceService.conductAudit(
        testOrgId,
        'hipaa_1996',
        'auditor_123',
        ['privacy_rule', 'security_rule']
      );

      expect(audit).toMatchObject({
        id: expect.any(String),
        frameworkId: 'hipaa_1996',
        organizationId: testOrgId,
        auditorId: 'auditor_123',
        startDate: expect.any(Date),
        endDate: expect.any(Date),
        status: expect.stringMatching(/^(completed|failed)$/),
        scope: ['privacy_rule', 'security_rule'],
        findings: expect.any(Array),
        overallScore: expect.any(Number),
      });

      expect(audit.id).toMatch(/^audit_/);
      expect(audit.overallScore).toBeGreaterThanOrEqual(0);
      expect(audit.overallScore).toBeLessThanOrEqual(100);
    });
  });

  describe('SOC 2 Compliance', () => {
    it('should get SOC 2 compliance status', async () => {
      const status = await complianceService.getComplianceStatus(testOrgId, 'soc2_2017');

      expect(status).toMatchObject({
        overall: expect.any(Number),
        frameworks: expect.arrayContaining([
          expect.objectContaining({
            id: 'soc2_2017',
            name: expect.stringContaining('SOC 2'),
            score: expect.any(Number),
            status: expect.stringMatching(/^(compliant|non_compliant|in_progress)$/),
          }),
        ]),
      });
    });

    it('should conduct SOC 2 audit', async () => {
      const audit = await complianceService.conductAudit(
        testOrgId,
        'soc2_2017',
        'auditor_456',
        ['security', 'availability', 'confidentiality']
      );

      expect(audit).toMatchObject({
        id: expect.any(String),
        frameworkId: 'soc2_2017',
        organizationId: testOrgId,
        status: expect.stringMatching(/^(completed|failed)$/),
        scope: ['security', 'availability', 'confidentiality'],
        overallScore: expect.any(Number),
      });
    });
  });

  describe('PCI DSS Compliance', () => {
    it('should get PCI DSS compliance status', async () => {
      const status = await complianceService.getComplianceStatus(testOrgId, 'pci_dss_4_0');

      expect(status).toMatchObject({
        overall: expect.any(Number),
        frameworks: expect.arrayContaining([
          expect.objectContaining({
            id: 'pci_dss_4_0',
            name: expect.stringContaining('PCI DSS'),
            score: expect.any(Number),
            status: expect.stringMatching(/^(compliant|non_compliant|in_progress)$/),
          }),
        ]),
      });
    });

    it('should conduct PCI DSS audit', async () => {
      const audit = await complianceService.conductAudit(
        testOrgId,
        'pci_dss_4_0',
        'auditor_789',
        ['network_security', 'data_protection', 'access_control']
      );

      expect(audit).toMatchObject({
        id: expect.any(String),
        frameworkId: 'pci_dss_4_0',
        organizationId: testOrgId,
        status: expect.stringMatching(/^(completed|failed)$/),
        scope: ['network_security', 'data_protection', 'access_control'],
        overallScore: expect.any(Number),
      });
    });
  });

  describe('Compliance Reporting', () => {
    it('should generate compliance report in JSON format', async () => {
      const report = await complianceService.generateComplianceReport(
        testOrgId,
        'gdpr_2018',
        'json'
      );

      expect(report).toMatchObject({
        reportId: expect.any(String),
        format: 'json',
        data: expect.objectContaining({
          organization: testOrgId,
          framework: expect.any(String),
          generatedAt: expect.any(Date),
          overallScore: expect.any(Number),
          summary: expect.any(Object),
          requirements: expect.any(Array),
          recommendations: expect.any(Array),
        }),
        generatedAt: expect.any(Date),
      });

      expect(report.reportId).toMatch(/^report_/);
    });

    it('should generate compliance report in PDF format', async () => {
      const report = await complianceService.generateComplianceReport(
        testOrgId,
        'soc2_2017',
        'pdf'
      );

      expect(report).toMatchObject({
        reportId: expect.any(String),
        format: 'pdf',
        data: expect.any(Object),
        generatedAt: expect.any(Date),
      });
    });

    it('should generate compliance report in CSV format', async () => {
      const report = await complianceService.generateComplianceReport(
        testOrgId,
        'hipaa_1996',
        'csv'
      );

      expect(report).toMatchObject({
        reportId: expect.any(String),
        format: 'csv',
        data: expect.any(Object),
        generatedAt: expect.any(Date),
      });
    });
  });

  describe('Multi-Framework Compliance', () => {
    it('should get overall compliance status across all frameworks', async () => {
      const status = await complianceService.getComplianceStatus(testOrgId);

      expect(status).toMatchObject({
        overall: expect.any(Number),
        frameworks: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            score: expect.any(Number),
            status: expect.stringMatching(/^(compliant|non_compliant|in_progress)$/),
          }),
        ]),
      });

      expect(status.frameworks.length).toBeGreaterThan(0);
      expect(status.overall).toBeGreaterThanOrEqual(0);
      expect(status.overall).toBeLessThanOrEqual(100);
    });

    it('should handle compliance across multiple industries', async () => {
      // Test healthcare organization
      const healthcareStatus = await complianceService.getComplianceStatus('healthcare_org', 'hipaa_1996');
      expect(healthcareStatus.frameworks[0].id).toBe('hipaa_1996');

      // Test financial organization
      const financialStatus = await complianceService.getComplianceStatus('financial_org', 'pci_dss_4_0');
      expect(financialStatus.frameworks[0].id).toBe('pci_dss_4_0');

      // Test tech organization
      const techStatus = await complianceService.getComplianceStatus('tech_org', 'soc2_2017');
      expect(techStatus.frameworks[0].id).toBe('soc2_2017');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid framework ID', async () => {
      await expect(
        complianceService.getComplianceStatus(testOrgId, 'invalid_framework')
      ).rejects.toThrow();
    });

    it('should handle invalid data subject request type', async () => {
      const invalidRequest = {
        type: 'invalid_type' as any,
        dataSubjectId: testDataSubjectId,
        organizationId: testOrgId,
        details: 'Invalid request',
        verificationMethod: 'email',
      };

      await expect(
        complianceService.handleDataSubjectRequest(invalidRequest)
      ).rejects.toThrow();
    });

    it('should handle missing required fields in data processing record', async () => {
      const invalidRecord = {
        organizationId: testOrgId,
        // Missing required fields
      } as any;

      await expect(
        complianceService.recordDataProcessing(invalidRecord)
      ).rejects.toThrow();
    });

    it('should handle audit with invalid scope', async () => {
      await expect(
        complianceService.conductAudit(
          testOrgId,
          'gdpr_2018',
          'auditor_123',
          ['invalid_scope']
        )
      ).rejects.toThrow();
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple concurrent compliance operations', async () => {
      const operations = [];

      // Multiple data processing records
      for (let i = 0; i < 5; i++) {
        operations.push(
          complianceService.recordDataProcessing({
            organizationId: testOrgId,
            dataType: `test_data_type_${i}`,
            purpose: `Test purpose ${i}`,
            legalBasis: 'legitimate_interest',
            dataSubjects: ['customers'],
            categories: ['contact_info'],
            recipients: ['internal'],
            transfers: [],
            retention: { period: '1 year', criteria: 'Business need' },
            securityMeasures: ['encryption'],
            dataProtectionOfficer: 'dpo@test.com',
          })
        );
      }

      // Multiple consent records
      for (let i = 0; i < 5; i++) {
        operations.push(
          complianceService.recordConsent({
            dataSubjectId: `subject_${i}`,
            organizationId: testOrgId,
            purpose: `Purpose ${i}`,
            dataTypes: ['email'],
            consentGiven: new Date(),
            method: 'explicit',
            evidence: `Evidence ${i}`,
            status: 'active',
          })
        );
      }

      const results = await Promise.all(operations);

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result).toHaveProperty('id');
        expect(result.id).toMatch(/^(dpr_|consent_)/);
      });
    }, 30000);

    it('should complete compliance status check within acceptable time', async () => {
      const startTime = Date.now();
      
      await complianceService.getComplianceStatus(testOrgId);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within 2 seconds
      expect(duration).toBeLessThan(2000);
    });

    it('should handle large-scale audit efficiently', async () => {
      const startTime = Date.now();
      
      await complianceService.conductAudit(
        testOrgId,
        'gdpr_2018',
        'performance_auditor',
        [] // Empty scope means all categories
      );
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within 10 seconds
      expect(duration).toBeLessThan(10000);
    });
  });
});

describe('Compliance Integration Tests', () => {
  it('should integrate with all compliance frameworks', async () => {
    const complianceService = new ComplianceService();
    const testOrgId = 'integration_test_org';

    // Test all frameworks
    const frameworks = ['gdpr_2018', 'hipaa_1996', 'soc2_2017', 'pci_dss_4_0'];
    
    for (const frameworkId of frameworks) {
      const status = await complianceService.getComplianceStatus(testOrgId, frameworkId);
      
      expect(status).toMatchObject({
        overall: expect.any(Number),
        frameworks: expect.arrayContaining([
          expect.objectContaining({
            id: frameworkId,
            name: expect.any(String),
            score: expect.any(Number),
          }),
        ]),
      });
    }
  });

  it('should maintain compliance across service lifecycle', async () => {
    const complianceService = new ComplianceService();
    const testOrgId = 'lifecycle_test_org';

    // 1. Record initial data processing
    const processing = await complianceService.recordDataProcessing({
      organizationId: testOrgId,
      dataType: 'customer_data',
      purpose: 'Service delivery',
      legalBasis: 'contract',
      dataSubjects: ['customers'],
      categories: ['personal_info'],
      recipients: ['internal'],
      transfers: [],
      retention: { period: '5 years', criteria: 'Legal requirement' },
      securityMeasures: ['encryption', 'access_control'],
      dataProtectionOfficer: 'dpo@test.com',
    });

    // 2. Record consent
    const consent = await complianceService.recordConsent({
      dataSubjectId: 'lifecycle_customer',
      organizationId: testOrgId,
      purpose: 'Marketing',
      dataTypes: ['email', 'preferences'],
      consentGiven: new Date(),
      method: 'explicit',
      evidence: 'Opt-in form submission',
      status: 'active',
    });

    // 3. Conduct audit
    const audit = await complianceService.conductAudit(
      testOrgId,
      'gdpr_2018',
      'lifecycle_auditor',
      ['data_protection_principles']
    );

    // 4. Generate report
    const report = await complianceService.generateComplianceReport(
      testOrgId,
      'gdpr_2018',
      'json'
    );

    // Verify all operations completed successfully
    expect(processing.id).toMatch(/^dpr_/);
    expect(consent.id).toMatch(/^consent_/);
    expect(audit.id).toMatch(/^audit_/);
    expect(report.reportId).toMatch(/^report_/);

    // Verify compliance status improved
    const finalStatus = await complianceService.getComplianceStatus(testOrgId, 'gdpr_2018');
    expect(finalStatus.overall).toBeGreaterThan(0);
  });
});
