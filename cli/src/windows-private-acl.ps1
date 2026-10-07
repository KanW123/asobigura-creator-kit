param([Parameter(Mandatory=$true)][string]$TargetPath)
$ErrorActionPreference = 'Stop'
$item = Get-Item -LiteralPath $TargetPath -Force
if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Credential reparse point rejected' }
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = $item.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
if ($item.PSIsContainer) {
  $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow')
} else {
  $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'Allow')
}
$acl.SetAccessRuleProtection($true, $false)
foreach ($oldRule in @($acl.GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier]))) {
  $acl.RemoveAccessRuleSpecific($oldRule)
}
$acl.AddAccessRule($rule)
$item.SetAccessControl($acl)
$actual = Get-Acl -LiteralPath $TargetPath
$rules = @($actual.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
if (-not $actual.AreAccessRulesProtected -or $rules.Count -ne 1 -or $rules[0].IdentityReference.Value -ne $sid.Value -or $rules[0].AccessControlType -ne 'Allow') {
  throw 'Credential ACL verification failed'
}
